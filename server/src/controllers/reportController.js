import { PrismaClient } from '@prisma/client';
import { decrypt } from '../utils/encryption.js';
import { fetchConversationsWithMessages } from '../services/ghlService.js';
import { generateReport } from '../services/reportService.js';

const prisma = new PrismaClient();

export async function generate(req, res) {
  try {
    const { ghlClientId, title, dateFrom, dateTo, conversationTypes, prompt } = req.body;

    if (!ghlClientId || !dateFrom || !dateTo || !prompt) {
      return res.status(400).json({ error: 'Client, date range, and prompt are required' });
    }

    const client = await prisma.gHLClient.findFirst({
      where: { id: ghlClientId, userId: req.userId },
    });
    if (!client) return res.status(404).json({ error: 'GHL client not found' });

    const report = await prisma.report.create({
      data: {
        title: title || `Report - ${new Date().toLocaleDateString()}`,
        ghlClientId,
        userId: req.userId,
        dateFrom: new Date(dateFrom),
        dateTo: new Date(dateTo),
        conversationTypes: conversationTypes || [],
        prompt,
        status: 'processing',
        progressMessage: 'Fetching conversations from GHL...',
      },
    });

    res.status(201).json({ id: report.id, status: 'processing' });

    try {
      const token = decrypt(client.bearerToken);

      const conversations = await fetchConversationsWithMessages(
        token,
        client.locationId,
        dateFrom,
        dateTo,
        conversationTypes || [],
        async (message) => {
          await prisma.report.update({
            where: { id: report.id },
            data: { progressMessage: message },
          });
        }
      );

      await prisma.report.update({
        where: { id: report.id },
        data: { totalConversations: conversations.length },
      });

      const result = await generateReport(conversations, prompt, async (message) => {
        await prisma.report.update({
          where: { id: report.id },
          data: { progressMessage: message },
        });
      });

      await prisma.report.update({
        where: { id: report.id },
        data: { result, status: 'completed', progressMessage: null },
      });
    } catch (err) {
      console.error('Report generation error:', err);
      await prisma.report.update({
        where: { id: report.id },
        data: { status: 'failed', error: err.message, progressMessage: null },
      });
    }
  } catch (err) {
    console.error('Generate report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listReports(req, res) {
  try {
    const reports = await prisma.report.findMany({
      where: { userId: req.userId },
      include: { ghlClient: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports.map(r => ({
      ...r,
      clientName: r.ghlClient.name,
      ghlClient: undefined,
      result: undefined,
    })));
  } catch (err) {
    console.error('List reports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getReport(req, res) {
  try {
    const report = await prisma.report.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
      include: { ghlClient: { select: { name: true } } },
    });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ ...report, clientName: report.ghlClient.name });
  } catch (err) {
    console.error('Get report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteReport(req, res) {
  try {
    const existing = await prisma.report.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Report not found' });
    await prisma.report.delete({ where: { id: existing.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
