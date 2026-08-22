#!/usr/bin/env node
'use strict';

/**
 * expense_tracker.js — a dependency-free CLI personal expense tracker.
 *
 * Features: JSON persistence, CSV import/export, search & filtering,
 * summary reports, input validation, structured logging, sample data.
 *
 * Interactive:   node expense_tracker.js
 * Non-interactive: node expense_tracker.js --seed 40 --report --export out.csv
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Configuration & constants
// ---------------------------------------------------------------------------

const CONFIG = {
  dataDir: process.env.EXPENSE_HOME || path.join(process.cwd(), '.expense-tracker'),
  dataFile: 'expenses.json',
  logFile: 'tracker.log',
  currencySymbol: process.env.EXPENSE_SYMBOL || '$',
  logLevel: process.env.EXPENSE_LOG_LEVEL || 'info',
  monthlyBudget: Number(process.env.EXPENSE_BUDGET || 2500),
  maxAmount: 1000000,
  pageSize: 20,
};

const CATEGORIES = [
  'food', 'groceries', 'rent', 'utilities', 'transport', 'health',
  'entertainment', 'shopping', 'travel', 'education', 'savings', 'other',
];

const PAYMENT_METHODS = ['cash', 'card', 'debit', 'credit', 'transfer', 'wallet'];

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

class AppError extends Error {
  constructor(message, code = 'APP_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
class ValidationError extends AppError {
  constructor(field, message) {
    super(`${field}: ${message}`, 'VALIDATION');
    this.field = field;
  }
}
class StorageError extends AppError {
  constructor(message, cause) {
    super(message, 'STORAGE');
    this.cause = cause;
  }
}
class NotFoundError extends AppError {
  constructor(id) {
    super(`no expense found with id "${id}"`, 'NOT_FOUND');
  }
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

class Logger {
  constructor({ dir, file, level = 'info' }) {
    this.filePath = path.join(dir, file);
    this.threshold = LEVELS[level] != null ? LEVELS[level] : LEVELS.info;
    this.buffer = [];
    try {
      fs.mkdirSync(dir, { recursive: true });
      this.enabled = true;
    } catch (err) {
      this.enabled = false;
      process.stderr.write(`[logger] disabled: ${err.message}\n`);
    }
  }

  log(level, message, meta) {
    if ((LEVELS[level] || 0) < this.threshold) return;
    const stamp = new Date().toISOString();
    const extra = meta ? ` ${JSON.stringify(meta)}` : '';
    const line = `${stamp} [${level.toUpperCase().padEnd(5)}] ${message}${extra}`;
    this.buffer.push(line);
    if (this.buffer.length > 500) this.buffer.shift();
    if (!this.enabled) return;
    try {
      fs.appendFileSync(this.filePath, line + '\n', 'utf8');
    } catch (err) {
      this.enabled = false;
      process.stderr.write(`[logger] write failed: ${err.message}\n`);
    }
  }

  debug(m, x) { this.log('debug', m, x); }
  info(m, x) { this.log('info', m, x); }
  warn(m, x) { this.log('warn', m, x); }
  error(m, x) { this.log('error', m, x); }

  tail(n = 20) {
    return this.buffer.slice(-n);
  }
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

const Util = {
  money(value) {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(Number(value) || 0).toFixed(2);
    const [whole, cents] = abs.split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}${CONFIG.currencySymbol}${grouped}.${cents}`;
  },

  todayISO() {
    return new Date().toISOString().slice(0, 10);
  },

  monthKey(iso) {
    return String(iso).slice(0, 7);
  },

  isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  },

  truncate(text, width) {
    const s = String(text == null ? '' : text);
    return s.length <= width ? s : s.slice(0, Math.max(0, width - 1)) + '…';
  },

  sum(numbers) {
    return numbers.reduce((acc, n) => acc + n, 0);
  },

  round(value, digits = 2) {
    const f = Math.pow(10, digits);
    return Math.round(value * f) / f;
  },

  uid() {
    const rand = Math.random().toString(36).slice(2, 8);
    return `exp_${Date.now().toString(36)}${rand}`;
  },

  bar(ratio, width = 24) {
    const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
    return '█'.repeat(filled) + '·'.repeat(width - filled);
  },

  table(headers, rows) {
    if (rows.length === 0) return '  (no rows)';
    const widths = headers.map((h, i) =>
      Math.max(String(h).length, ...rows.map((r) => String(r[i] == null ? '' : r[i]).length)));
    const line = (cells) => '  ' + cells
      .map((c, i) => String(c == null ? '' : c).padEnd(widths[i]))
      .join('  ').trimEnd();
    const divider = '  ' + widths.map((w) => '-'.repeat(w)).join('  ');
    return [line(headers), divider, ...rows.map(line)].join('\n');
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const Validate = {
  amount(raw) {
    const cleaned = String(raw).replace(/[,\s]/g, '').replace(/^\$/, '');
    if (cleaned === '') throw new ValidationError('amount', 'is required');
    const value = Number(cleaned);
    if (!Number.isFinite(value)) throw new ValidationError('amount', `"${raw}" is not a number`);
    if (value <= 0) throw new ValidationError('amount', 'must be greater than zero');
    if (value > CONFIG.maxAmount) {
      throw new ValidationError('amount', `must not exceed ${Util.money(CONFIG.maxAmount)}`);
    }
    return Util.round(value, 2);
  },

  date(raw) {
    const value = String(raw || '').trim();
    if (value === '' || value.toLowerCase() === 'today') return Util.todayISO();
    if (!Util.isIsoDate(value)) throw new ValidationError('date', 'expected YYYY-MM-DD');
    if (value > Util.todayISO()) throw new ValidationError('date', 'cannot be in the future');
    return value;
  },

  category(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === '') return 'other';
    const hit = CATEGORIES.find((c) => c === value || c.startsWith(value));
    if (!hit) throw new ValidationError('category', `unknown "${raw}" (try: ${CATEGORIES.join(', ')})`);
    return hit;
  },

  method(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === '') return 'card';
    const hit = PAYMENT_METHODS.find((m) => m === value || m.startsWith(value));
    if (!hit) throw new ValidationError('method', `unknown "${raw}" (try: ${PAYMENT_METHODS.join(', ')})`);
    return hit;
  },

  description(raw) {
    const value = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
    if (value.length === 0) throw new ValidationError('description', 'is required');
    if (value.length > 120) throw new ValidationError('description', 'must be 120 characters or fewer');
    return value;
  },

  tags(raw) {
    if (Array.isArray(raw)) return Validate.tags(raw.join(','));
    const parts = String(raw || '')
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''))
      .filter(Boolean);
    return Array.from(new Set(parts)).slice(0, 8);
  },
};

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

class Expense {
  constructor(data = {}) {
    this.id = data.id || Util.uid();
    this.date = Validate.date(data.date);
    this.amount = Validate.amount(data.amount);
    this.category = Validate.category(data.category);
    this.description = Validate.description(data.description);
    this.method = Validate.method(data.method);
    this.tags = Validate.tags(data.tags);
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
  }

  get month() {
    return Util.monthKey(this.date);
  }

  patch(changes) {
    const next = new Expense({ ...this.toJSON(), ...changes, id: this.id });
    next.createdAt = this.createdAt;
    next.updatedAt = new Date().toISOString();
    return next;
  }

  matchesText(needle) {
    const q = String(needle).toLowerCase();
    return this.description.toLowerCase().includes(q)
      || this.category.includes(q)
      || this.tags.some((t) => t.includes(q));
  }

  toJSON() {
    return {
      id: this.id,
      date: this.date,
      amount: this.amount,
      category: this.category,
      description: this.description,
      method: this.method,
      tags: this.tags.slice(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toRow() {
    return [
      this.id,
      this.date,
      Util.money(this.amount).padStart(11),
      this.category,
      this.method,
      Util.truncate(this.description, 34),
      this.tags.join('|'),
    ];
  }
}

Expense.COLUMNS = ['ID', 'DATE', 'AMOUNT', 'CATEGORY', 'METHOD', 'DESCRIPTION', 'TAGS'];

// ---------------------------------------------------------------------------
// CSV codec
// ---------------------------------------------------------------------------

const Csv = {
  HEADER: ['id', 'date', 'amount', 'category', 'description', 'method', 'tags'],

  escape(field) {
    const s = String(field == null ? '' : field);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  },

  encode(expenses) {
    const lines = [Csv.HEADER.join(',')];
    for (const e of expenses) {
      lines.push([
        e.id, e.date, e.amount.toFixed(2), e.category,
        e.description, e.method, e.tags.join('|'),
      ].map(Csv.escape).join(','));
    }
    return lines.join('\n') + '\n';
  },

  splitLine(line) {
    const fields = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else current += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { fields.push(current); current = ''; }
      else current += ch;
    }
    fields.push(current);
    return fields;
  },

  decode(text) {
    const lines = String(text).split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length === 0) throw new ValidationError('csv', 'file is empty');
    const header = Csv.splitLine(lines[0]).map((h) => h.trim().toLowerCase());
    const index = (name) => header.indexOf(name);
    if (index('amount') === -1 || index('description') === -1) {
      throw new ValidationError('csv', 'header must include "amount" and "description"');
    }
    const parsed = [];
    const errors = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cells = Csv.splitLine(lines[i]);
      const pick = (name) => (index(name) === -1 ? '' : cells[index(name)]);
      try {
        parsed.push(new Expense({
          id: pick('id') || undefined,
          date: pick('date'),
          amount: pick('amount'),
          category: pick('category'),
          description: pick('description'),
          method: pick('method'),
          tags: pick('tags').split('|').join(','),
        }));
      } catch (err) {
        errors.push(`line ${i + 1}: ${err.message}`);
      }
    }
    return { parsed, errors };
  },
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

class JsonStore {
  constructor(dir, file, logger) {
    this.dir = dir;
    this.filePath = path.join(dir, file);
    this.log = logger;
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.log.info('no data file yet, starting empty', { file: this.filePath });
        return [];
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (raw.trim() === '') return [];
      const payload = JSON.parse(raw);
      const records = Array.isArray(payload) ? payload : payload.expenses || [];
      const restored = [];
      let skipped = 0;
      for (const record of records) {
        try {
          restored.push(new Expense(record));
        } catch (err) {
          skipped += 1;
          this.log.warn('dropped corrupt record', { reason: err.message });
        }
      }
      this.log.info('loaded expenses', { count: restored.length, skipped });
      return restored;
    } catch (err) {
      if (err instanceof SyntaxError) {
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        try { fs.copyFileSync(this.filePath, backup); } catch (_) { /* best effort */ }
        this.log.error('data file is not valid JSON', { backup });
        throw new StorageError(`data file is corrupt; a copy was kept at ${backup}`, err);
      }
      throw new StorageError(`cannot read ${this.filePath}: ${err.message}`, err);
    }
  }

  save(expenses) {
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      count: expenses.length,
      expenses: expenses.map((e) => e.toJSON()),
    };
    const tmp = `${this.filePath}.tmp`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
      this.log.info('saved expenses', { count: expenses.length });
    } catch (err) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
      throw new StorageError(`cannot write ${this.filePath}: ${err.message}`, err);
    }
  }

  writeText(target, contents) {
    const dest = path.isAbsolute(target) ? target : path.join(process.cwd(), target);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, contents, 'utf8');
      return dest;
    } catch (err) {
      throw new StorageError(`cannot write ${dest}: ${err.message}`, err);
    }
  }

  readText(target) {
    const src = path.isAbsolute(target) ? target : path.join(process.cwd(), target);
    if (!fs.existsSync(src)) throw new StorageError(`file not found: ${src}`);
    return fs.readFileSync(src, 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Service layer: CRUD, search, statistics
// ---------------------------------------------------------------------------

class ExpenseService {
  constructor(store, logger) {
    this.store = store;
    this.log = logger;
    this.expenses = store.load();
  }

  get size() {
    return this.expenses.length;
  }

  all() {
    return this.expenses.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  add(data) {
    const expense = new Expense(data);
    this.expenses.push(expense);
    this.store.save(this.expenses);
    this.log.info('added expense', { id: expense.id, amount: expense.amount });
    return expense;
  }

  addMany(list) {
    const created = list.map((d) => (d instanceof Expense ? d : new Expense(d)));
    this.expenses.push(...created);
    this.store.save(this.expenses);
    this.log.info('bulk insert', { count: created.length });
    return created;
  }

  find(idOrPrefix) {
    const needle = String(idOrPrefix || '').trim();
    if (needle === '') throw new ValidationError('id', 'is required');
    const hits = this.expenses.filter((e) => e.id === needle || e.id.startsWith(needle));
    if (hits.length === 0) throw new NotFoundError(needle);
    if (hits.length > 1) throw new ValidationError('id', `"${needle}" matches ${hits.length} records`);
    return hits[0];
  }

  update(idOrPrefix, changes) {
    const current = this.find(idOrPrefix);
    const index = this.expenses.indexOf(current);
    const updated = current.patch(changes);
    this.expenses[index] = updated;
    this.store.save(this.expenses);
    this.log.info('updated expense', { id: updated.id, fields: Object.keys(changes) });
    return updated;
  }

  remove(idOrPrefix) {
    const current = this.find(idOrPrefix);
    this.expenses = this.expenses.filter((e) => e !== current);
    this.store.save(this.expenses);
    this.log.warn('removed expense', { id: current.id });
    return current;
  }

  clear() {
    const removed = this.expenses.length;
    this.expenses = [];
    this.store.save(this.expenses);
    this.log.warn('cleared all expenses', { removed });
    return removed;
  }

  search(filter = {}) {
    let results = this.all();
    if (filter.text) results = results.filter((e) => e.matchesText(filter.text));
    if (filter.category) results = results.filter((e) => e.category === filter.category);
    if (filter.method) results = results.filter((e) => e.method === filter.method);
    if (filter.from) results = results.filter((e) => e.date >= filter.from);
    if (filter.to) results = results.filter((e) => e.date <= filter.to);
    if (filter.month) results = results.filter((e) => e.month === filter.month);
    if (filter.min != null) results = results.filter((e) => e.amount >= filter.min);
    if (filter.max != null) results = results.filter((e) => e.amount <= filter.max);
    if (filter.tag) results = results.filter((e) => e.tags.includes(filter.tag));
    if (filter.sort === 'amount') results.sort((a, b) => b.amount - a.amount);
    this.log.debug('search executed', { filter, hits: results.length });
    return results;
  }

  totals(expenses = this.expenses) {
    const amounts = expenses.map((e) => e.amount);
    const total = Util.sum(amounts);
    const sorted = amounts.slice().sort((a, b) => a - b);
    const median = sorted.length === 0 ? 0
      : sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    return {
      count: expenses.length,
      total: Util.round(total),
      average: expenses.length ? Util.round(total / expenses.length) : 0,
      median: Util.round(median),
      min: sorted.length ? sorted[0] : 0,
      max: sorted.length ? sorted[sorted.length - 1] : 0,
    };
  }

  groupBy(keyFn, expenses = this.expenses) {
    const buckets = new Map();
    for (const e of expenses) {
      const key = keyFn(e);
      if (!buckets.has(key)) buckets.set(key, { key, count: 0, total: 0, items: [] });
      const bucket = buckets.get(key);
      bucket.count += 1;
      bucket.total = Util.round(bucket.total + e.amount);
      bucket.items.push(e);
    }
    return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
  }

  budgetStatus(month = Util.monthKey(Util.todayISO())) {
    const spent = Util.round(Util.sum(this.search({ month }).map((e) => e.amount)));
    const budget = CONFIG.monthlyBudget;
    return {
      month,
      spent,
      budget,
      remaining: Util.round(budget - spent),
      ratio: budget > 0 ? spent / budget : 0,
      overspent: spent > budget,
    };
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const Report = {
  listing(expenses, limit = CONFIG.pageSize) {
    if (expenses.length === 0) return '  no matching expenses.';
    const shown = expenses.slice(0, limit);
    const body = Util.table(Expense.COLUMNS, shown.map((e) => e.toRow()));
    const hidden = expenses.length - shown.length;
    const footer = `\n  ${expenses.length} record(s), total ${Util.money(Util.sum(expenses.map((e) => e.amount)))}`
      + (hidden > 0 ? ` — ${hidden} more not shown` : '');
    return body + footer;
  },

  summary(service, expenses = service.expenses) {
    const t = service.totals(expenses);
    return [
      '  Overview',
      `    records .......... ${t.count}`,
      `    total spent ...... ${Util.money(t.total)}`,
      `    average .......... ${Util.money(t.average)}`,
      `    median ........... ${Util.money(t.median)}`,
      `    smallest ......... ${Util.money(t.min)}`,
      `    largest .......... ${Util.money(t.max)}`,
    ].join('\n');
  },

  byCategory(service, expenses = service.expenses) {
    const groups = service.groupBy((e) => e.category, expenses);
    const grand = Util.sum(groups.map((g) => g.total)) || 1;
    const rows = groups.map((g) => [
      g.key,
      g.count,
      Util.money(g.total).padStart(11),
      `${((g.total / grand) * 100).toFixed(1)}%`.padStart(6),
      Util.bar(g.total / grand, 20),
    ]);
    return Util.table(['CATEGORY', 'N', 'TOTAL', 'SHARE', 'DISTRIBUTION'], rows);
  },

  byMonth(service, expenses = service.expenses) {
    const groups = service.groupBy((e) => e.month, expenses)
      .sort((a, b) => (a.key < b.key ? -1 : 1));
    const peak = Math.max(1, ...groups.map((g) => g.total));
    const rows = groups.map((g) => [
      g.key,
      g.count,
      Util.money(g.total).padStart(11),
      Util.money(g.total / g.count).padStart(10),
      Util.bar(g.total / peak, 20),
    ]);
    return Util.table(['MONTH', 'N', 'TOTAL', 'AVG', 'TREND'], rows);
  },

  budget(service) {
    const b = service.budgetStatus();
    const flag = b.overspent ? 'OVER BUDGET' : 'within budget';
    return [
      `  Budget for ${b.month}`,
      `    ${Util.bar(Math.min(1, b.ratio), 30)} ${(b.ratio * 100).toFixed(1)}%`,
      `    spent ${Util.money(b.spent)} of ${Util.money(b.budget)} — ${flag}`,
      `    ${b.overspent ? 'exceeded by' : 'remaining'} ${Util.money(Math.abs(b.remaining))}`,
    ].join('\n');
  },

  top(service, limit = 5) {
    const rows = service.search({ sort: 'amount' }).slice(0, limit)
      .map((e, i) => [`#${i + 1}`, e.date, Util.money(e.amount).padStart(11), e.category, Util.truncate(e.description, 40)]);
    return Util.table(['RANK', 'DATE', 'AMOUNT', 'CATEGORY', 'DESCRIPTION'], rows);
  },

  full(service) {
    return [
      Report.summary(service),
      '',
      Report.byCategory(service),
      '',
      Report.byMonth(service),
      '',
      Report.top(service),
      '',
      Report.budget(service),
    ].join('\n');
  },
};

// ---------------------------------------------------------------------------
// Sample data generation (seeded, so runs are reproducible)
// ---------------------------------------------------------------------------

const Sample = {
  rng(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  BLUEPRINT: {
    food: { range: [8, 65], labels: ['Lunch special', 'Coffee and pastry', 'Team dinner', 'Ramen bar'] },
    groceries: { range: [20, 180], labels: ['Weekly groceries', 'Farmers market', 'Bulk pantry run'] },
    rent: { range: [900, 1600], labels: ['Monthly rent', 'Parking space'] },
    utilities: { range: [30, 190], labels: ['Electricity bill', 'Internet plan', 'Water bill'] },
    transport: { range: [3, 95], labels: ['Metro top-up', 'Taxi ride', 'Fuel'] },
    health: { range: [15, 260], labels: ['Pharmacy', 'Dental check-up', 'Gym membership'] },
    entertainment: { range: [9, 120], labels: ['Cinema tickets', 'Streaming plan', 'Concert'] },
    shopping: { range: [12, 320], labels: ['Running shoes', 'Winter jacket', 'Headphones'] },
    travel: { range: [60, 780], labels: ['Train ticket', 'Hotel night', 'Flight'] },
    education: { range: [20, 400], labels: ['Online course', 'Textbook', 'Workshop'] },
    savings: { range: [50, 500], labels: ['Index fund transfer', 'Emergency fund'] },
    other: { range: [5, 90], labels: ['Misc supplies', 'Gift', 'Donation'] },
  },

  generate(count = 40, seed = 20260822) {
    const rand = Sample.rng(seed);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const keys = Object.keys(Sample.BLUEPRINT);
    const now = new Date();
    const records = [];
    for (let i = 0; i < count; i += 1) {
      const category = pick(keys);
      const plan = Sample.BLUEPRINT[category];
      const amount = plan.range[0] + rand() * (plan.range[1] - plan.range[0]);
      const daysBack = Math.floor(rand() * 150);
      const when = new Date(now.getTime() - daysBack * 86400000);
      records.push(new Expense({
        date: when.toISOString().slice(0, 10),
        amount: Util.round(amount, 2),
        category,
        description: pick(plan.labels),
        method: pick(PAYMENT_METHODS),
        tags: [category, rand() > 0.6 ? 'recurring' : 'one-off'].join(','),
      }));
    }
    return records;
  },
};

// ---------------------------------------------------------------------------
// Interactive prompt helpers
// ---------------------------------------------------------------------------

class Prompt {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY),
    });
    this.queue = [];
    this.pending = null;
    this.closed = false;
    this.rl.on('line', (line) => this.push(line));
    this.rl.on('close', () => {
      this.closed = true;
      this.push('', true);
    });
  }

  push(line, onlyPending = false) {
    const text = String(line).trim();
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve(text);
    } else if (!onlyPending) {
      this.queue.push(text);
    }
  }

  hasInput() {
    return !this.closed || this.queue.length > 0;
  }

  ask(question) {
    process.stdout.write(question);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (!process.stdin.isTTY) process.stdout.write(`${next}\n`);
      return Promise.resolve(next);
    }
    if (this.closed) return Promise.resolve('');
    return new Promise((resolve) => { this.pending = resolve; });
  }

  async askValidated(question, validator, { optional = false } = {}) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const answer = await this.ask(question);
      if (optional && answer === '') return undefined;
      try {
        return validator(answer);
      } catch (err) {
        if (!this.hasInput()) return undefined;
        console.log(`  ! ${err.message}`);
      }
    }
    throw new ValidationError('input', 'too many invalid attempts');
  }

  async confirm(question) {
    const answer = (await this.ask(`${question} [y/N] `)).toLowerCase();
    return answer === 'y' || answer === 'yes';
  }

  close() {
    if (!this.closed) this.rl.close();
  }
}

// ---------------------------------------------------------------------------
// CLI application
// ---------------------------------------------------------------------------

const MENU = [
  ['1', 'Add an expense'],
  ['2', 'List recent expenses'],
  ['3', 'Search / filter'],
  ['4', 'Edit an expense'],
  ['5', 'Delete an expense'],
  ['6', 'Full report'],
  ['7', 'Export to CSV'],
  ['8', 'Import from CSV'],
  ['9', 'Generate sample data'],
  ['10', 'Show recent log lines'],
  ['0', 'Quit'],
];

class App {
  constructor(service, logger, prompt) {
    this.service = service;
    this.log = logger;
    this.prompt = prompt;
    this.running = true;
  }

  banner() {
    console.log('');
    console.log('  ============================================');
    console.log('   Personal Expense Tracker');
    console.log(`   data: ${this.service.store.filePath}`);
    console.log(`   records: ${this.service.size}  budget: ${Util.money(CONFIG.monthlyBudget)}/month`);
    console.log('  ============================================');
  }

  showMenu() {
    console.log('');
    for (const [key, label] of MENU) console.log(`   ${key.padStart(2)}) ${label}`);
    console.log('');
  }

  async addExpense() {
    console.log('\n  New expense (blank date = today, Ctrl+C to abort)');
    const amount = await this.prompt.askValidated('   amount: ', Validate.amount);
    if (amount === undefined) return;
    const description = await this.prompt.askValidated('   description: ', Validate.description);
    if (description === undefined) return;
    const category = await this.prompt.askValidated(
      `   category [${CATEGORIES.join('/')}]: `, Validate.category);
    const date = await this.prompt.askValidated('   date (YYYY-MM-DD): ', Validate.date);
    const method = await this.prompt.askValidated(
      `   method [${PAYMENT_METHODS.join('/')}]: `, Validate.method);
    const tags = await this.prompt.askValidated('   tags (comma separated): ', Validate.tags);
    const created = this.service.add({ amount, description, category, date, method, tags });
    console.log(`\n  + saved ${created.id} — ${Util.money(created.amount)} on ${created.category}`);
  }

  async listExpenses() {
    console.log('');
    console.log(Report.listing(this.service.all()));
    console.log('');
    console.log(Report.budget(this.service));
  }

  async searchExpenses() {
    console.log('\n  Filters — leave blank to skip');
    const filter = {};
    filter.text = (await this.prompt.ask('   keyword: ')) || undefined;
    filter.category = await this.prompt.askValidated('   category: ', Validate.category, { optional: true });
    filter.from = await this.prompt.askValidated('   from date: ', Validate.date, { optional: true });
    filter.to = await this.prompt.askValidated('   to date: ', Validate.date, { optional: true });
    filter.min = await this.prompt.askValidated('   min amount: ', Validate.amount, { optional: true });
    filter.max = await this.prompt.askValidated('   max amount: ', Validate.amount, { optional: true });
    const sortByAmount = await this.prompt.confirm('   sort by amount?');
    if (sortByAmount) filter.sort = 'amount';
    const results = this.service.search(filter);
    console.log('');
    console.log(Report.listing(results));
    if (results.length > 0) {
      console.log('');
      console.log(Report.summary(this.service, results));
    }
  }

  async editExpense() {
    const id = await this.prompt.ask('\n   id (or unique prefix) to edit: ');
    const current = this.service.find(id);
    console.log(`   editing ${current.id}: ${Util.money(current.amount)} ${current.category} "${current.description}"`);
    console.log('   blank keeps the current value');
    const changes = {};
    const amount = await this.prompt.askValidated('   new amount: ', Validate.amount, { optional: true });
    if (amount !== undefined) changes.amount = amount;
    const description = await this.prompt.askValidated('   new description: ', Validate.description, { optional: true });
    if (description !== undefined) changes.description = description;
    const category = await this.prompt.askValidated('   new category: ', Validate.category, { optional: true });
    if (category !== undefined) changes.category = category;
    if (Object.keys(changes).length === 0) {
      console.log('   nothing to change.');
      return;
    }
    const updated = this.service.update(current.id, changes);
    console.log(`   ~ updated ${updated.id}`);
  }

  async deleteExpense() {
    const id = await this.prompt.ask('\n   id (or unique prefix) to delete: ');
    const target = this.service.find(id);
    console.log(`   ${target.date}  ${Util.money(target.amount)}  ${target.category}  ${target.description}`);
    if (!(await this.prompt.confirm('   really delete this?'))) {
      console.log('   cancelled.');
      return;
    }
    this.service.remove(target.id);
    console.log(`   - deleted ${target.id}`);
  }

  async exportCsv() {
    const target = (await this.prompt.ask('\n   output file [expenses.csv]: ')) || 'expenses.csv';
    const dest = this.service.store.writeText(target, Csv.encode(this.service.all()));
    console.log(`   wrote ${this.service.size} record(s) to ${dest}`);
    this.log.info('exported csv', { dest, count: this.service.size });
  }

  async importCsv() {
    const source = await this.prompt.ask('\n   input file: ');
    if (!source) return;
    const { parsed, errors } = Csv.decode(this.service.store.readText(source));
    for (const problem of errors) console.log(`   ! skipped ${problem}`);
    if (parsed.length === 0) {
      console.log('   nothing imported.');
      return;
    }
    if (!(await this.prompt.confirm(`   import ${parsed.length} record(s)?`))) return;
    this.service.addMany(parsed);
    console.log(`   imported ${parsed.length} record(s); ${errors.length} skipped`);
  }

  async seedSamples() {
    const raw = await this.prompt.ask('\n   how many sample records? [40] ');
    const count = Math.max(1, Math.min(1000, Number(raw) || 40));
    const created = this.service.addMany(Sample.generate(count));
    console.log(`   generated ${created.length} sample record(s)`);
  }

  showLog() {
    console.log('\n  Recent log lines');
    const lines = this.log.tail(15);
    if (lines.length === 0) console.log('   (log buffer empty)');
    else for (const line of lines) console.log(`   ${line}`);
  }

  async dispatch(choice) {
    switch (choice) {
      case '1': return this.addExpense();
      case '2': return this.listExpenses();
      case '3': return this.searchExpenses();
      case '4': return this.editExpense();
      case '5': return this.deleteExpense();
      case '6': console.log('\n' + Report.full(this.service)); return undefined;
      case '7': return this.exportCsv();
      case '8': return this.importCsv();
      case '9': return this.seedSamples();
      case '10': this.showLog(); return undefined;
      case '0': case 'q': case 'quit': this.running = false; return undefined;
      case '': return undefined;
      default:
        console.log(`  unknown option "${choice}"`);
        return undefined;
    }
  }

  async run() {
    this.banner();
    while (this.running && this.prompt.hasInput()) {
      this.showMenu();
      const choice = await this.prompt.ask('  choose an option: ');
      if (choice === '' && !this.prompt.hasInput()) break;
      try {
        await this.dispatch(choice);
      } catch (err) {
        if (err instanceof AppError) {
          console.log(`  ! ${err.message}`);
          this.log.warn('handled error', { code: err.code, message: err.message });
        } else {
          console.log(`  ! unexpected error: ${err.message}`);
          this.log.error('unhandled error', { message: err.message, stack: err.stack });
        }
      }
    }
    console.log('\n  goodbye.\n');
    this.prompt.close();
  }
}

// ---------------------------------------------------------------------------
// Entry point (interactive menu, or one-shot flags)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = { seed: null, report: false, list: false, export: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--report') flags.report = true;
    else if (arg === '--list') flags.list = true;
    else if (arg === '--seed') flags.seed = Math.max(1, Number(argv[++i]) || 40);
    else if (arg === '--export') flags.export = argv[++i] || 'expenses.csv';
    else console.log(`  ignoring unknown flag "${arg}"`);
  }
  return flags;
}

function usage() {
  console.log([
    '',
    '  Personal Expense Tracker',
    '',
    '  usage: node expense_tracker.js [options]',
    '',
    '    --seed <n>      insert n generated sample expenses',
    '    --list          print all expenses and exit',
    '    --report        print the full report and exit',
    '    --export <file> write all expenses to a CSV file',
    '    -h, --help      show this help',
    '',
    '  environment: EXPENSE_HOME, EXPENSE_BUDGET, EXPENSE_LOG_LEVEL, EXPENSE_SYMBOL',
    '',
  ].join('\n'));
}

async function main() {
  const logger = new Logger({ dir: CONFIG.dataDir, file: CONFIG.logFile, level: CONFIG.logLevel });
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    usage();
    return 0;
  }
  logger.info('session started', { pid: process.pid, node: process.version });
  let service;
  try {
    service = new ExpenseService(new JsonStore(CONFIG.dataDir, CONFIG.dataFile, logger), logger);
  } catch (err) {
    console.error(`  fatal: ${err.message}`);
    logger.error('startup failed', { message: err.message });
    return 1;
  }

  const oneShot = flags.seed || flags.list || flags.report || flags.export;
  if (oneShot) {
    if (flags.seed) {
      const created = service.addMany(Sample.generate(flags.seed));
      console.log(`  seeded ${created.length} sample expense(s)`);
    }
    if (flags.list) console.log('\n' + Report.listing(service.all(), 1000));
    if (flags.report) console.log('\n' + Report.full(service));
    if (flags.export) {
      const dest = service.store.writeText(flags.export, Csv.encode(service.all()));
      console.log(`  exported ${service.size} record(s) to ${dest}`);
    }
    logger.info('one-shot run complete');
    return 0;
  }

  const prompt = new Prompt();
  process.on('SIGINT', () => {
    console.log('\n  interrupted — closing.');
    logger.warn('SIGINT received');
    prompt.close();
    process.exit(130);
  });
  await new App(service, logger, prompt).run();
  logger.info('session ended');
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      console.error(`  fatal: ${err && err.message ? err.message : err}`);
      process.exitCode = 1;
    });
}

module.exports = {
  App, Csv, CONFIG, CATEGORIES, PAYMENT_METHODS, Expense, ExpenseService,
  JsonStore, Logger, Prompt, Report, Sample, Util, Validate,
  AppError, ValidationError, StorageError, NotFoundError,
};
