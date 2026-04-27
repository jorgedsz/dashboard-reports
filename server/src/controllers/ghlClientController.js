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
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function create(req, res) {
  try {
    const { name, bearerToken, locationId } = req.body;
    if (!name || !bearerToken || !locationId) {
      return res.status(400).json({ error: 'Nombre, bearer token y location ID son requeridos' });
    }
    const encryptedToken = encrypt(bearerToken);
    const client = await prisma.gHLClient.create({
      data: { name, bearerToken: encryptedToken, locationId, userId: req.userId },
      select: { id: true, name: true, locationId: true, createdAt: true },
    });
    res.status(201).json(client);
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function get(req, res) {
  try {
    const client = await prisma.gHLClient.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
      select: { id: true, name: true, locationId: true, createdAt: true, updatedAt: true },
    });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(client);
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function update(req, res) {
  try {
    const existing = await prisma.gHLClient.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

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
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function remove(req, res) {
  try {
    const existing = await prisma.gHLClient.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });
    await prisma.gHLClient.delete({ where: { id: existing.id } });
    res.json({ message: 'Eliminado' });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function testConnection(req, res) {
  try {
    const client = await prisma.gHLClient.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const token = decrypt(client.bearerToken);
    const response = await axios.get(`${GHL_BASE}/conversations/search`, {
      headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' },
      params: { locationId: client.locationId, limit: 1 },
    });
    res.json({ success: true, message: 'Conexión exitosa' });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('Test connection error:', status, detail);
    if (status === 401) {
      return res.json({ success: false, message: 'Bearer token inválido (401)' });
    }
    if (status === 400) {
      return res.json({ success: false, message: 'Solicitud inválida — verifica el location ID (400)' });
    }
    if (status === 422) {
      return res.json({ success: false, message: 'Parámetros inválidos (422):' + detail });
    }
    res.json({ success: false, message: `Conexión fallida (${status || 'network'}): ${detail}` });
  }
}
