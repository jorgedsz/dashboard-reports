import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { encrypt, decrypt } from '../utils/encryption.js';

const prisma = new PrismaClient();
const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';

export async function list(req, res) {
  try {
    const accounts = await prisma.twilioAccount.findMany({
      where: { userId: req.userId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(accounts);
  } catch (err) {
    console.error('List Twilio accounts error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function create(req, res) {
  try {
    const { name, accountSid, authToken } = req.body;
    if (!name || !accountSid || !authToken) {
      return res.status(400).json({ error: 'Nombre, Account SID y Auth Token son requeridos' });
    }
    const encryptedSid = encrypt(accountSid);
    const encryptedToken = encrypt(authToken);
    const account = await prisma.twilioAccount.create({
      data: { name, accountSid: encryptedSid, authToken: encryptedToken, userId: req.userId },
      select: { id: true, name: true, createdAt: true },
    });
    res.status(201).json(account);
  } catch (err) {
    console.error('Create Twilio account error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function get(req, res) {
  try {
    const account = await prisma.twilioAccount.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    if (!account) return res.status(404).json({ error: 'Cuenta Twilio no encontrada' });
    res.json(account);
  } catch (err) {
    console.error('Get Twilio account error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function update(req, res) {
  try {
    const existing = await prisma.twilioAccount.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Cuenta Twilio no encontrada' });

    const data = {};
    if (req.body.name) data.name = req.body.name;
    if (req.body.accountSid) data.accountSid = encrypt(req.body.accountSid);
    if (req.body.authToken) data.authToken = encrypt(req.body.authToken);

    const updated = await prisma.twilioAccount.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, updatedAt: true },
    });
    res.json(updated);
  } catch (err) {
    console.error('Update Twilio account error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function remove(req, res) {
  try {
    const existing = await prisma.twilioAccount.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Cuenta Twilio no encontrada' });
    await prisma.twilioAccount.delete({ where: { id: existing.id } });
    res.json({ message: 'Eliminado' });
  } catch (err) {
    console.error('Delete Twilio account error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function testConnection(req, res) {
  try {
    const account = await prisma.twilioAccount.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!account) return res.status(404).json({ error: 'Cuenta Twilio no encontrada' });

    const accountSid = decrypt(account.accountSid);
    const authToken = decrypt(account.authToken);

    await axios.get(`${TWILIO_BASE}/Accounts/${accountSid}/Calls.json`, {
      auth: { username: accountSid, password: authToken },
      params: { PageSize: 1 },
    });
    res.json({ success: true, message: 'Conexion exitosa' });
  } catch (err) {
    const status = err.response?.status;
    console.error('Twilio test connection error:', status, err.message);
    if (status === 401) {
      return res.json({ success: false, message: 'Credenciales invalidas (401)' });
    }
    res.json({ success: false, message: `Conexion fallida (${status || 'network'}): ${err.message}` });
  }
}
