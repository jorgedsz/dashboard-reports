import { PrismaClient } from '@prisma/client';
import { decrypt } from '../utils/encryption.js';
import { fetchConversationsWithMessages } from '../services/ghlService.js';
import { fetchCallsWithRecordings } from '../services/twilioService.js';
import { generateReport, generateTwilioReport } from '../services/reportService.js';

const prisma = new PrismaClient();

export async function generate(req, res) {
  try {
    const { sourceType, ghlClientId, twilioAccountId, title, dateFrom, dateTo, conversationTypes, prompt } = req.body;
    const source = sourceType || 'ghl';

    if (!dateFrom || !dateTo || !prompt) {
      return res.status(400).json({ error: 'Rango de fechas y prompt son requeridos' });
    }

    if (source === 'ghl') {
      if (!ghlClientId) return res.status(400).json({ error: 'Cliente GHL es requerido' });
      const client = await prisma.gHLClient.findFirst({
        where: { id: ghlClientId, userId: req.userId },
      });
      if (!client) return res.status(404).json({ error: 'Cliente GHL no encontrado' });

      const report = await prisma.report.create({
        data: {
          title: title || `Reporte - ${new Date().toLocaleDateString()}`,
          sourceType: 'ghl',
          ghlClientId,
          userId: req.userId,
          dateFrom: new Date(dateFrom),
          dateTo: new Date(dateTo),
          conversationTypes: conversationTypes || [],
          prompt,
          status: 'processing',
          progressMessage: 'Obteniendo conversaciones de GHL...',
        },
      });

      res.status(201).json({ id: report.id, status: 'processing' });

      try {
        const token = decrypt(client.bearerToken);
        const conversations = await fetchConversationsWithMessages(
          token, client.locationId, dateFrom, dateTo, conversationTypes || [],
          async (message) => {
            await prisma.report.update({ where: { id: report.id }, data: { progressMessage: message } });
          }
        );

        await prisma.report.update({
          where: { id: report.id },
          data: { totalConversations: conversations.length },
        });

        const result = await generateReport(conversations, prompt, async (message) => {
          await prisma.report.update({ where: { id: report.id }, data: { progressMessage: message } });
        });

        await prisma.report.update({
          where: { id: report.id },
          data: { result, status: 'completed', progressMessage: null },
        });
      } catch (err) {
        console.error('GHL report generation error:', err);
        await prisma.report.update({
          where: { id: report.id },
          data: { status: 'failed', error: err.message, progressMessage: null },
        });
      }

    } else if (source === 'twilio') {
      if (!twilioAccountId) return res.status(400).json({ error: 'Cuenta Twilio es requerida' });
      const account = await prisma.twilioAccount.findFirst({
        where: { id: twilioAccountId, userId: req.userId },
      });
      if (!account) return res.status(404).json({ error: 'Cuenta Twilio no encontrada' });

      const report = await prisma.report.create({
        data: {
          title: title || `Reporte - ${new Date().toLocaleDateString()}`,
          sourceType: 'twilio',
          twilioAccountId,
          userId: req.userId,
          dateFrom: new Date(dateFrom),
          dateTo: new Date(dateTo),
          conversationTypes: [],
          prompt,
          status: 'processing',
          progressMessage: 'Obteniendo llamadas de Twilio...',
        },
      });

      res.status(201).json({ id: report.id, status: 'processing' });

      try {
        const accountSid = decrypt(account.accountSid);
        const authToken = decrypt(account.authToken);

        const calls = await fetchCallsWithRecordings(
          accountSid, authToken, dateFrom, dateTo,
          async (message) => {
            await prisma.report.update({ where: { id: report.id }, data: { progressMessage: message } });
          }
        );

        await prisma.report.update({
          where: { id: report.id },
          data: { totalConversations: calls.length },
        });

        const result = await generateTwilioReport(calls, prompt, async (message) => {
          await prisma.report.update({ where: { id: report.id }, data: { progressMessage: message } });
        });

        await prisma.report.update({
          where: { id: report.id },
          data: { result, status: 'completed', progressMessage: null },
        });
      } catch (err) {
        console.error('Twilio report generation error:', err);
        await prisma.report.update({
          where: { id: report.id },
          data: { status: 'failed', error: err.message, progressMessage: null },
        });
      }

    } else {
      return res.status(400).json({ error: 'Tipo de fuente invalido' });
    }
  } catch (err) {
    console.error('Generate report error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function listReports(req, res) {
  try {
    const reports = await prisma.report.findMany({
      where: { userId: req.userId },
      include: {
        ghlClient: { select: { name: true } },
        twilioAccount: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports.map(r => ({
      ...r,
      clientName: r.ghlClient?.name || r.twilioAccount?.name || 'N/A',
      ghlClient: undefined,
      twilioAccount: undefined,
      result: undefined,
    })));
  } catch (err) {
    console.error('List reports error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function getReport(req, res) {
  try {
    const report = await prisma.report.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
      include: {
        ghlClient: { select: { name: true } },
        twilioAccount: { select: { name: true } },
      },
    });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });
    res.json({
      ...report,
      clientName: report.ghlClient?.name || report.twilioAccount?.name || 'N/A',
    });
  } catch (err) {
    console.error('Get report error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function deleteReport(req, res) {
  try {
    const existing = await prisma.report.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Reporte no encontrado' });
    await prisma.report.delete({ where: { id: existing.id } });
    res.json({ message: 'Eliminado' });
  } catch (err) {
    console.error('Delete report error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
