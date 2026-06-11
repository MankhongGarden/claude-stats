#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const scoring = require('../lib/scoring.js');

const SITE_URL = 'https://mankhonggarden.github.io/claude-stats/';

function parseArgs(argv) {
  const args = { json: false, share: true, dir: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--no-share') args.share = false;
    else if (a === '--dir') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) { args.help = true; }
      else { args.dir = next; i++; }
    }
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log([
    'claude-stats - analyze your Claude Code usage as an MMORPG character sheet',
    '',
    'Usage: npx github:MankhongGarden/claude-stats [options]',
    '',
    'Options:',
    '  --dir <path>   Path to Claude projects dir (default: $CLAUDE_CONFIG_DIR/projects or ~/.claude/projects)',
    '  --json         Print raw JSON instead of the card',
    '  --no-share     Skip printing the share URL',
    '  --help         Show this help',
    '',
    'Privacy: everything is parsed locally. Only 6 aggregate scores go into the share URL.'
  ].join('\n'));
}

function resolveDataDir(args) {
  const candidates = [];
  if (args.dir) candidates.push(args.dir);
  else {
    if (process.env.CLAUDE_CONFIG_DIR) candidates.push(path.join(process.env.CLAUDE_CONFIG_DIR, 'projects'));
    candidates.push(path.join(os.homedir(), '.claude', 'projects'));
  }
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory()) return c;
    } catch (e) { /* keep looking */ }
  }
  return null;
}

function skipDir(name) {
  return name === 'subagents' || name.startsWith('wf_');
}

function collectJsonlFiles(rootDir) {
  const files = [];
  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch (e) {
    return files;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || skipDir(entry.name)) continue;
    walk(path.join(rootDir, entry.name), files);
  }
  return files;
}

function walk(dir, files) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDir(entry.name)) walk(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(full);
    }
  }
}

function processFile(filePath, acc) {
  return new Promise((resolve) => {
    let stream;
    try {
      stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    } catch (e) {
      return resolve();
    }
    stream.on('error', () => resolve());
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!line) return;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch (e) {
        return;
      }
      if (!obj || typeof obj !== 'object') return;
      if (obj.type === 'user') {
        acc.userMessages++;
        return;
      }
      if (obj.type !== 'assistant') return;
      acc.assistantMessages++;
      const content = obj.message && obj.message.content;
      if (!Array.isArray(content)) return;
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'tool_use') {
          acc.toolCalls++;
          const axis = scoring.classifyTool(block.name);
          if (axis) acc.units[axis]++;
        } else if (block.type === 'text' && typeof block.text === 'string') {
          acc.textChars += block.text.length;
        }
      }
    });
    rl.on('close', () => resolve());
  });
}

function bar(score) {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (process.platform === 'win32') {
    try { process.stdout.setDefaultEncoding('utf8'); } catch (e) { /* best effort */ }
  }

  const dataDir = resolveDataDir(args);
  if (!dataDir) {
    console.error('Could not find a Claude Code projects directory.');
    console.error('Looked for: ' + (args.dir ? args.dir : '$CLAUDE_CONFIG_DIR/projects and ~/.claude/projects'));
    console.error('If your data lives elsewhere, point at it with: --dir <path>');
    process.exit(1);
  }

  const files = collectJsonlFiles(dataDir);
  if (files.length === 0) {
    console.error('No session transcripts (*.jsonl) found under: ' + dataDir);
    console.error('Run a few Claude Code sessions first, or point at another dir with --dir <path>.');
    process.exit(1);
  }

  const acc = {
    toolCalls: 0,
    userMessages: 0,
    assistantMessages: 0,
    textChars: 0,
    units: { automator: 0, researcher: 0, coder: 0, integrator: 0, writer: 0, pilot: 0 }
  };

  for (const file of files) {
    await processFile(file, acc);
  }

  acc.units.writer = acc.textChars / 4000;

  const stats = scoring.scoreAxes(acc.units, 'cli');
  const lv = scoring.level(acc.toolCalls);
  const top = scoring.topAxis(stats);
  const cls = scoring.CLASSES[top];
  const totals = {
    sessions: files.length,
    toolCalls: acc.toolCalls,
    userMessages: acc.userMessages,
    assistantMessages: acc.assistantMessages
  };
  const payload = { v: 1, src: 'cli', stats: stats, totals: { sessions: totals.sessions, toolCalls: totals.toolCalls, userMsgs: totals.userMessages } };
  const shareUrl = SITE_URL + '#s=' + scoring.encodeShare(payload);

  if (args.json) {
    const out = {
      v: 1,
      src: 'cli',
      dataDir: dataDir,
      stats: stats,
      level: lv,
      topAxis: top,
      class: cls[0],
      totals: totals
    };
    if (args.share) out.shareUrl = shareUrl;
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const lines = [];
  lines.push('');
  lines.push('  CLAUDE STATUS CHECK');
  lines.push('  ' + '-'.repeat(46));
  lines.push('  ' + cls[0] + '  LV ' + lv);
  lines.push('  ' + cls[1]);
  lines.push('  ' + '-'.repeat(46));
  for (const axis of scoring.AXES) {
    const name = scoring.META[axis].en.padEnd(11);
    const score = String(stats[axis]).padStart(3);
    lines.push('  ' + name + bar(stats[axis]) + ' ' + score);
  }
  lines.push('  ' + '-'.repeat(46));
  lines.push('  sessions ' + totals.sessions +
    ' | tool calls ' + totals.toolCalls +
    ' | your msgs ' + totals.userMessages);
  console.log(lines.join('\n'));

  if (args.share) {
    console.log('');
    console.log('  Share your card (only the 6 aggregate scores are in this URL):');
    console.log('  ' + shareUrl);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Unexpected error: ' + (err && err.message ? err.message : String(err)));
  process.exit(1);
});
