import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { encrypt, decrypt } from '../utils/encryption.js';

const prisma = new PrismaClient();
const GHL_BASE = 'https://services.leadconnectorhq.com';

export async function list(req, res) {
  try {
    const clients = await prisma.gHLClient.findMany({
      where: { userId: req.userId },
      select: { id: true, name: true, locationId: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(clients);
  } catch (err) {
    console.error('List clients error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function create(req, res) {
  try {
    const { name, bearerToken, locationId } = req.body;
    if (!name || !bearerToken || !locationId) {
      return res.status(400).json({ error: 'Name, bearer token, and location ID are required' });
    }
    const encryptedToken = encrypt(bearerToken);
    const client = await prisma.gHLClient.create({
      data: { name, bearerToken: encryptedToken, locationId, userId: req.userId },
      select: { id: true, name: true, locationId: true, createdAt: true },
    });
    res.status(201).json(client);
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function get(req, res) {
  try {
    const client = await prisma.gHLClient.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
      select: { id: true, name: true, locationId: true, createdAt: true, updatedAt: true },
    });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function update(req, res) {
  try {
    const existing = await prisma.gHLClient.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    const data = {};
    if (req.body.name) data.name = req.body.name;
    if (req.body.locationId) data.locationId = req.body.locationId;
    if (req.body.bearerToken) data.bearerToken = encrypt(req.body.bearerToken);

    const updated = await prisma.gHLClient.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, locationId: true, updatedAt: true },
    });
    res.json(updated);
  } catch (err) {
    console.error('Update client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function remove(req, res) {
  try {
    const existing = await prisma.gHLClient.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    await prisma.gHLClient.delete({ where: { id: existing.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function testConnection(req, res) {
  try {
    const client = await prisma.gHLClient.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const token = decrypt(client.bearerToken);
    const response = await axios.get(`${GHL_BASE}/conversations/search`, {
      headers: { Authorization: `Bearer ${token}`, Version: '20210124' },
      params: { locationId: client.locationId, limit: 1 },
    });
    res.json({ success: true, message: 'Connection successful' });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('Test connection error:', status, detail);
    if (status === 401) {
      return res.json({ success: false, message: 'Invalid bearer token (401)' });
    }
    if (status === 400) {
      return res.json({ success: false, message: 'Bad request — check location ID (400)' });
    }
    if (status === 422) {
      return res.json({ success: false, message: 'Invalid parameters (422): ' + detail });
    }
    res.json({ success: false, message: `Connection failed (${status || 'network'}): ${detail}` });
  }
}
