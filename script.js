/* ==========================================================================
   Linux Practice Terminal — script.js
   A simulated Linux shell running entirely in the browser.
   Nothing here touches a real filesystem, network, or OS.
   ========================================================================== */

/* ============================================================
   1. DISCLAIMER
   ============================================================ */
document.getElementById('disclaimer-ok-btn').addEventListener('click', () => {
  document.getElementById('disclaimer-overlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('terminal-input').focus();
});

/* ============================================================
   2. TAB SWITCHING
   ============================================================ */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'filemanager-tab') renderFileManager();
    if (btn.dataset.tab === 'terminal-tab') document.getElementById('terminal-input').focus();
  });
});

/* ============================================================
   3. VIRTUAL FILE SYSTEM
   A node is: { type: 'dir'|'file', perms, owner, group, size, mtime, children?, content? }
   ============================================================ */

function nowStamp() {
  const d = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2,' ')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function makeDir(perms = 'drwxr-xr-x') {
  return { type: 'dir', perms, owner: 'student', group: 'student', mtime: nowStamp(), children: {} };
}
function makeFile(content = '', perms = '-rw-r--r--') {
  return { type: 'file', perms, owner: 'student', group: 'student', mtime: nowStamp(), content };
}

const FS = {
  root: makeDir('drwxr-xr-x')
};

// seed a realistic starter tree
(function seedFS() {
  const root = FS.root;
  root.children['home'] = makeDir();
  root.children['home'].children['student'] = makeDir();
  const home = root.children['home'].children['student'];

  home.children['Documents'] = makeDir();
  home.children['Downloads'] = makeDir();
  home.children['Pictures'] = makeDir();
  home.children['Desktop'] = makeDir();

  home.children['welcome.txt'] = makeFile(
`Welcome to the Linux Practice Terminal!

This is a simulated home directory. Try commands like:
  ls -la
  cat welcome.txt
  mkdir practice && cd practice
  echo "hello world" > hello.txt
  cat hello.txt

Type 'help' to see quick tips, or open the "All Commands" tab
for a full reference of Linux commands with examples.
`);

  home.children['notes.txt'] = makeFile('TODO:\n- Learn basic navigation (ls, cd, pwd)\n- Practice file operations (cp, mv, rm)\n- Try permissions (chmod, chown)\n');

  home.children['Documents'].children['report.txt'] = makeFile('Quarterly report draft.\n');
  home.children['Documents'].children['todo.md'] = makeFile('# TODO\n- [ ] Learn grep\n- [ ] Learn find\n');
  home.children['Downloads'].children['archive.tar.gz'] = makeFile('[binary data - simulated]', '-rw-r--r--');
  home.children['Pictures'].children['sample.png'] = makeFile('[binary data - simulated]', '-rw-r--r--');

  root.children['etc'] = makeDir();
  root.children['etc'].children['hostname'] = makeFile('linux-practice\n');
  root.children['etc'].children['passwd'] = makeFile('root:x:0:0:root:/root:/bin/bash\nstudent:x:1000:1000:student:/home/student:/bin/bash\n');

  root.children['var'] = makeDir();
  root.children['var'].children['log'] = makeDir();
  root.children['var'].children['log'].children['syslog'] = makeFile('[simulated system log]\n');

  root.children['bin'] = makeDir();
  root.children['usr'] = makeDir();
  root.children['tmp'] = makeDir('drwxrwxrwx');
})();

let cwdPath = ['home', 'student']; // path segments from root

function pathString(segs) {
  return '/' + segs.join('/');
}
function displayPath(segs) {
  const s = pathString(segs);
  if (s === '/home/student') return '~';
  if (s.startsWith('/home/student/')) return '~' + s.slice('/home/student'.length);
  return s;
}

function resolveSegments(inputPath) {
  // returns array of segments from root, or null if invalid traversal
  let segs;
  if (inputPath.startsWith('/')) {
    segs = [];
  } else if (inputPath.startsWith('~')) {
    segs = ['home', 'student'];
    inputPath = inputPath.slice(1);
    if (inputPath.startsWith('/')) inputPath = inputPath.slice(1);
  } else {
    segs = cwdPath.slice();
  }
  const parts = inputPath.split('/').filter(p => p.length > 0);
  for (const part of parts) {
    if (part === '.') continue;
    else if (part === '..') { if (segs.length > 0) segs.pop(); }
    else segs.push(part);
  }
  return segs;
}

function getNode(segs) {
  let node = FS.root;
  for (const s of segs) {
    if (!node.children || !node.children[s]) return null;
    node = node.children[s];
  }
  return node;
}
function getParentAndName(segs) {
  const name = segs[segs.length - 1];
  const parentSegs = segs.slice(0, -1);
  const parent = getNode(parentSegs);
  return { parent, name, parentSegs };
}
function humanSize(n) {
  if (n < 1024) return n + 'B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + 'K';
  return (n/1024/1024).toFixed(1) + 'M';
}
function nodeSize(node) {
  if (node.type === 'file') return node.content.length;
  return 4096;
}

/* ============================================================
   4. COMMAND LINE PARSING (quotes, pipes, redirection)
   ============================================================ */

function tokenize(line) {
  const tokens = [];
  let cur = '';
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) { inS = !inS; continue; }
    if (c === '"' && !inS) { inD = !inD; continue; }
    if (c === ' ' && !inS && !inD) {
      if (cur.length) { tokens.push(cur); cur = ''; }
      continue;
    }
    cur += c;
  }
  if (cur.length) tokens.push(cur);
  return tokens;
}

// splits full line into pipeline segments by top-level `|`, respecting quotes
function splitPipeline(line) {
  const segments = [];
  let cur = '';
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    if (c === '"' && !inS) inD = !inD;
    if (c === '|' && !inS && !inD) {
      segments.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  segments.push(cur);
  return segments.map(s => s.trim()).filter(s => s.length);
}

function parseRedirection(tokens) {
  // returns { tokens: cleanedTokens, redirect: {type:'>'|'>>', target} | null }
  let redirect = null;
  const clean = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '>' || tokens[i] === '>>') {
      redirect = { type: tokens[i], target: tokens[i+1] };
      i++; // skip target
    } else {
      clean.push(tokens[i]);
    }
  }
  return { tokens: clean, redirect };
}

function splitFlagsArgs(tokens) {
  const flags = new Set();
  const args = [];
  for (const t of tokens) {
    if (t.startsWith('--')) flags.add(t.slice(2));
    else if (t.startsWith('-') && t.length > 1 && isNaN(Number(t))) {
      for (const ch of t.slice(1)) flags.add(ch);
    } else args.push(t);
  }
  return { flags, args };
}

/* ============================================================
   5. SHELL STATE: history, env vars, aliases
   ============================================================ */
const shellState = {
  history: [],
  env: { USER: 'student', HOME: '/home/student', SHELL: '/bin/bash', PATH: '/usr/local/bin:/usr/bin:/bin' },
  aliases: { ll: 'ls -la', la: 'ls -a' }
};

/* ============================================================
   6. COMMAND IMPLEMENTATIONS
   Each returns a string (stdout) or throws {msg} for stderr,
   OR returns {out, err} directly.
   ============================================================ */

const commands = {};

commands.pwd = () => pathString(cwdPath);

commands.whoami = () => 'student';

commands.hostname = () => 'linux-practice';

commands.date = () => new Date().toString();

commands.uname = ({flags}) => {
  if (flags.has('a')) return 'Linux linux-practice 6.8.0-simulated #1 SMP PREEMPT x86_64 GNU/Linux';
  return 'Linux';
};

commands.echo = ({args, flags}) => {
  let text = args.join(' ');
  // handle simple $VAR expansion
  text = text.replace(/\$([A-Z_]+)/g, (m, v) => shellState.env[v] ?? '');
  return flags.has('n') ? text : text + '\n' === text + '\n' ? text : text;
};

commands.clear = () => ({ clear: true });

commands.cd = ({args}) => {
  const target = args[0] || '~';
  const segs = resolveSegments(target === '~' ? '/home/student' : target);
  const node = getNode(segs);
  if (!node) throw { msg: `cd: ${target}: No such file or directory` };
  if (node.type !== 'dir') throw { msg: `cd: ${target}: Not a directory` };
  cwdPath = segs;
  updatePromptLabel();
  return '';
};

commands.ls = ({args, flags}) => {
  const target = args[0] ? resolveSegments(args[0]) : cwdPath;
  const node = getNode(target);
  if (!node) throw { msg: `ls: cannot access '${args[0]}': No such file or directory` };
  if (node.type === 'file') return args[0];

  let names = Object.keys(node.children);
  if (!flags.has('a')) names = names.filter(n => !n.startsWith('.'));
  names.sort();

  if (flags.has('l') || flags.has('la') || flags.has('al')) {
    const rows = names.map(n => {
      const c = node.children[n];
      const size = String(nodeSize(c)).padStart(6, ' ');
      return `${c.perms} 1 ${c.owner} ${c.group} ${size} ${c.mtime} ${n}${c.type === 'dir' ? '/' : ''}`;
    });
    return rows.length ? rows.join('\n') : '(empty directory)';
  }
  if (!names.length) return '';
  return names.map(n => node.children[n].type === 'dir' ? n + '/' : n).join('  ');
};

commands.mkdir = ({args, flags}) => {
  if (!args.length) throw { msg: 'mkdir: missing operand' };
  for (const a of args) {
    const segs = resolveSegments(a);
    const { parent, name } = getParentAndName(segs);
    if (!parent) {
      if (flags.has('p')) {
        // create intermediate dirs
        let cur = FS.root;
        for (const s of segs) {
          if (!cur.children[s]) cur.children[s] = makeDir();
          cur = cur.children[s];
        }
        continue;
      }
      throw { msg: `mkdir: cannot create directory '${a}': No such file or directory` };
    }
    if (parent.children[name]) {
      if (!flags.has('p')) throw { msg: `mkdir: cannot create directory '${a}': File exists` };
    } else {
      parent.children[name] = makeDir();
    }
  }
  return '';
};

commands.touch = ({args}) => {
  if (!args.length) throw { msg: 'touch: missing file operand' };
  for (const a of args) {
    const segs = resolveSegments(a);
    const { parent, name } = getParentAndName(segs);
    if (!parent) throw { msg: `touch: cannot touch '${a}': No such file or directory` };
    if (parent.children[name]) parent.children[name].mtime = nowStamp();
    else parent.children[name] = makeFile('');
  }
  return '';
};

commands.rm = ({args, flags}) => {
  if (!args.length) throw { msg: 'rm: missing operand' };
  for (const a of args) {
    const segs = resolveSegments(a);
    const { parent, name } = getParentAndName(segs);
    if (!parent || !parent.children[name]) {
      if (flags.has('f')) continue;
      throw { msg: `rm: cannot remove '${a}': No such file or directory` };
    }
    const target = parent.children[name];
    if (target.type === 'dir' && !flags.has('r')) {
      throw { msg: `rm: cannot remove '${a}': Is a directory` };
    }
    delete parent.children[name];
  }
  return '';
};

commands.rmdir = ({args}) => {
  for (const a of args) {
    const segs = resolveSegments(a);
    const { parent, name } = getParentAndName(segs);
    const target = parent && parent.children[name];
    if (!target) throw { msg: `rmdir: failed to remove '${a}': No such file or directory` };
    if (target.type !== 'dir') throw { msg: `rmdir: failed to remove '${a}': Not a directory` };
    if (Object.keys(target.children).length) throw { msg: `rmdir: failed to remove '${a}': Directory not empty` };
    delete parent.children[name];
  }
  return '';
};

function deepCopy(node) {
  if (node.type === 'file') return makeFile(node.content, node.perms);
  const d = makeDir(node.perms);
  for (const k in node.children) d.children[k] = deepCopy(node.children[k]);
  return d;
}

commands.cp = ({args, flags}) => {
  if (args.length < 2) throw { msg: 'cp: missing file operand' };
  const srcSegs = resolveSegments(args[0]);
  const src = getNode(srcSegs);
  if (!src) throw { msg: `cp: cannot stat '${args[0]}': No such file or directory` };
  if (src.type === 'dir' && !flags.has('r')) throw { msg: `cp: -r not specified; omitting directory '${args[0]}'` };

  let dstSegs = resolveSegments(args[1]);
  let dst = getNode(dstSegs);
  if (dst && dst.type === 'dir') {
    dstSegs = dstSegs.concat(srcSegs[srcSegs.length - 1]);
  }
  const { parent, name } = getParentAndName(dstSegs);
  if (!parent) throw { msg: `cp: cannot create '${args[1]}': No such file or directory` };
  parent.children[name] = deepCopy(src);
  return '';
};

commands.mv = ({args}) => {
  if (args.length < 2) throw { msg: 'mv: missing file operand' };
  const srcSegs = resolveSegments(args[0]);
  const { parent: srcParent, name: srcName } = getParentAndName(srcSegs);
  if (!srcParent || !srcParent.children[srcName]) throw { msg: `mv: cannot stat '${args[0]}': No such file or directory` };

  let dstSegs = resolveSegments(args[1]);
  let dstNode = getNode(dstSegs);
  if (dstNode && dstNode.type === 'dir') dstSegs = dstSegs.concat(srcName);
  const { parent: dstParent, name: dstName } = getParentAndName(dstSegs);
  if (!dstParent) throw { msg: `mv: cannot move to '${args[1]}': No such file or directory` };

  dstParent.children[dstName] = srcParent.children[srcName];
  delete srcParent.children[srcName];
  return '';
};

commands.cat = ({args}) => {
  if (!args.length) throw { msg: 'cat: missing operand' };
  const out = [];
  for (const a of args) {
    const node = getNode(resolveSegments(a));
    if (!node) throw { msg: `cat: ${a}: No such file or directory` };
    if (node.type === 'dir') throw { msg: `cat: ${a}: Is a directory` };
    out.push(node.content);
  }
  return out.join('');
};

commands.head = ({args, flags}) => {
  const n = 10;
  const node = getNode(resolveSegments(args[0]));
  if (!node) throw { msg: `head: cannot open '${args[0]}': No such file or directory` };
  return node.content.split('\n').slice(0, n).join('\n');
};

commands.tail = ({args}) => {
  const n = 10;
  const node = getNode(resolveSegments(args[0]));
  if (!node) throw { msg: `tail: cannot open '${args[0]}': No such file or directory` };
  const lines = node.content.split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
};

commands.wc = ({args, flags, stdin}) => {
  const text = stdin !== undefined ? stdin : (() => {
    const node = getNode(resolveSegments(args[0]));
    if (!node) throw { msg: `wc: ${args[0]}: No such file or directory` };
    return node.content;
  })();
  const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  const words = text.trim().length ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  if (flags.has('l')) return String(lines);
  if (flags.has('w')) return String(words);
  if (flags.has('c')) return String(chars);
  return `${lines} ${words} ${chars}${args[0] ? ' ' + args[0] : ''}`;
};

commands.grep = ({args, flags, stdin}) => {
  const pattern = args[0];
  if (!pattern) throw { msg: 'grep: missing pattern' };
  let text;
  if (stdin !== undefined) text = stdin;
  else {
    const node = getNode(resolveSegments(args[1]));
    if (!node) throw { msg: `grep: ${args[1]}: No such file or directory` };
    text = node.content;
  }
  let re;
  try { re = new RegExp(pattern, flags.has('i') ? 'i' : ''); } catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')); }
  const lines = text.split('\n').filter(l => flags.has('v') ? !re.test(l) : re.test(l));
  return lines.join('\n');
};

commands.find = ({args}) => {
  const start = args[0] ? resolveSegments(args[0]) : cwdPath;
  let nameFilter = null;
  const nameIdx = args.indexOf('-name');
  if (nameIdx !== -1) nameFilter = args[nameIdx + 1].replace(/\*/g, '.*');
  const results = [];
  function walk(segs) {
    const node = getNode(segs);
    if (!node) return;
    const p = pathString(segs);
    if (!nameFilter || new RegExp('^' + nameFilter + '$').test(segs[segs.length-1] || '')) results.push(p);
    if (node.type === 'dir') for (const k in node.children) walk(segs.concat(k));
  }
  walk(start);
  return results.join('\n');
};

commands.sort = ({stdin, args}) => {
  const text = stdin !== undefined ? stdin : (getNode(resolveSegments(args[0]))?.content ?? '');
  return text.split('\n').filter(l=>l.length).sort().join('\n');
};

commands.uniq = ({stdin, args}) => {
  const text = stdin !== undefined ? stdin : (getNode(resolveSegments(args[0]))?.content ?? '');
  const lines = text.split('\n');
  const out = [];
  for (const l of lines) if (out[out.length-1] !== l) out.push(l);
  return out.join('\n');
};

commands.chmod = ({args}) => {
  if (args.length < 2) throw { msg: 'chmod: missing operand' };
  const node = getNode(resolveSegments(args[1]));
  if (!node) throw { msg: `chmod: cannot access '${args[1]}': No such file or directory` };
  const mode = args[0];
  if (/^[0-7]{3}$/.test(mode)) {
    const map = ['---','--x','-w-','-wx','r--','r-x','rw-','rwx'];
    node.perms = (node.type === 'dir' ? 'd' : '-') + mode.split('').map(d => map[+d]).join('');
  }
  return '';
};

commands.chown = ({args}) => {
  if (args.length < 2) throw { msg: 'chown: missing operand' };
  const node = getNode(resolveSegments(args[1]));
  if (!node) throw { msg: `chown: cannot access '${args[1]}': No such file or directory` };
  const [owner, group] = args[0].split(':');
  node.owner = owner;
  if (group) node.group = group;
  return '';
};

commands.tree = ({args}) => {
  const start = args[0] ? resolveSegments(args[0]) : cwdPath;
  const root = getNode(start);
  if (!root) throw { msg: `tree: ${args[0]}: No such file or directory` };
  const lines = [displayPath(start)];
  function walk(node, prefix) {
    const keys = Object.keys(node.children || {}).sort();
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      lines.push(prefix + (last ? '└── ' : '├── ') + k + (node.children[k].type === 'dir' ? '/' : ''));
      if (node.children[k].type === 'dir') walk(node.children[k], prefix + (last ? '    ' : '│   '));
    });
  }
  walk(root, '');
  return lines.join('\n');
};

commands.history = () => shellState.history.map((h, i) => `  ${i+1}  ${h}`).join('\n');

commands.env = () => Object.entries(shellState.env).map(([k,v]) => `${k}=${v}`).join('\n');

commands.export = ({args}) => {
  const a = args[0] || '';
  const m = a.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
  if (m) shellState.env[m[1]] = m[2];
  return '';
};

commands.alias = ({args}) => {
  if (!args.length) return Object.entries(shellState.aliases).map(([k,v]) => `alias ${k}='${v}'`).join('\n');
  const m = args.join(' ').match(/^(\w+)=(.*)$/);
  if (m) shellState.aliases[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  return '';
};

commands.which = ({args}) => args[0] && commands[args[0]] ? `/usr/bin/${args[0]}` : `${args[0]}: not found`;
commands.whereis = ({args}) => `${args[0]}: /usr/bin/${args[0]}`;

commands.ps = () => (
`  PID TTY          TIME CMD
    1 ?        00:00:01 systemd
  842 pts/0    00:00:00 bash
 1190 pts/0    00:00:00 ps`);

commands.top = () => (
`top - simulated snapshot
Tasks:  84 total,   1 running,  83 sleeping
%Cpu(s):  3.2 us,  1.1 sy,  0.0 ni, 95.4 id
MiB Mem :   7897.0 total,   3120.4 free,   1890.2 used
  PID USER   PR  NI    VIRT    RES  %CPU %MEM COMMAND
  842 student 20   0  168000  11000   0.3  0.1 bash
 1190 student 20   0  102400   4200   0.1  0.0 top`);

commands.kill = ({args}) => `bash: kill: (${args[0] || ''}) - simulated: no real process affected`;

commands.df = () => (
`Filesystem     1K-blocks    Used Available Use% Mounted on
/dev/sda1       20514980 8452110  11021440  44% /
tmpfs             987120       0    987120   0% /dev/shm`);

commands.du = ({args}) => {
  const node = getNode(args[0] ? resolveSegments(args[0]) : cwdPath);
  function size(n) {
    if (n.type === 'file') return n.content.length;
    return Object.values(n.children).reduce((s,c) => s + size(c), 0) + 4096;
  }
  return `${Math.ceil(size(node)/1024)}K\t${args[0] || '.'}`;
};

commands.free = () => (
`              total        used        free      shared  buff/cache   available
Mem:        7897012     1890200     3120400        4200     2886412     5658900
Swap:       2097148           0     2097148`);

commands.man = ({args}) => {
  const c = args[0];
  const ref = COMMAND_DB.find(x => x.name === c);
  if (!ref) return `No manual entry for ${c}`;
  return `NAME\n    ${ref.name} - ${ref.short}\n\nSYNOPSIS\n    ${ref.syntax}\n\nDESCRIPTION\n    ${ref.description}`;
};

commands.help = () => (
`Linux Practice Terminal — quick tips
  - This is a simulated shell; commands operate on a virtual filesystem.
  - Try: ls, cd, pwd, mkdir, touch, cat, echo, rm, cp, mv, grep, find
  - Pipes work for a few commands, e.g.  ls | grep txt
  - Redirection works:  echo "hi" > file.txt   or   echo "more" >> file.txt
  - See the "All Commands" tab for full documentation on 60+ commands.
  - Type 'clear' to clear the screen.`);

commands.sudo = ({args, flags, stdin}) => {
  if (!args.length) throw { msg: 'sudo: a command is required' };
  const inner = args.join(' ');
  return runLine(inner, true);
};

commands.apt = ({args}) => aptLike(args);
commands['apt-get'] = ({args}) => aptLike(args);
function aptLike(args) {
  if (args[0] === 'update') return 'Reading package lists... Done\nBuilding dependency tree... Done\nAll packages are up to date.';
  if (args[0] === 'install') return `Reading package lists... Done\nSimulated install of: ${args.slice(1).join(', ') || '(no package given)'}\n(No real packages were installed — this is a simulation.)`;
  if (args[0] === 'upgrade') return 'Simulated upgrade — all packages already at latest version.';
  return `apt: usage: apt [update|install <pkg>|upgrade]`;
}

commands.ping = ({args}) => {
  const host = args[0] || 'localhost';
  return `PING ${host} (simulated): 56 data bytes\n64 bytes from ${host}: icmp_seq=0 ttl=64 time=0.041 ms\n64 bytes from ${host}: icmp_seq=1 ttl=64 time=0.038 ms\n^C\n--- ${host} ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss (simulated)`;
};

commands.ifconfig = () => (
`eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 10.0.2.15  netmask 255.255.255.0  broadcast 10.0.2.255 (simulated)
lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536
        inet 127.0.0.1  netmask 255.0.0.0 (simulated)`);

commands.ip = ({args}) => {
  if (args[0] === 'a' || args[0] === 'addr') return commands.ifconfig();
  return 'ip: usage: ip a';
};

commands.curl = ({args}) => `curl: (simulated) would fetch ${args[0] || '<url>'} — network access is disabled in this practice terminal.`;
commands.wget = ({args}) => `wget: (simulated) would download ${args[0] || '<url>'} — network access is disabled in this practice terminal.`;

commands.nano = ({args}) => `(simulated) Opening '${args[0] || 'new file'}' in nano.\nThis practice terminal does not implement a full text editor.\nUse: echo "text" > ${args[0] || 'file.txt'}  to write file content instead.`;
commands.vi = commands.vim = commands.nano;

commands.less = commands.more = ({args, stdin}) => stdin !== undefined ? stdin : commands.cat({args});

commands.diff = ({args}) => {
  const a = getNode(resolveSegments(args[0]));
  const b = getNode(resolveSegments(args[1]));
  if (!a || !b) throw { msg: 'diff: file not found' };
  if (a.content === b.content) return '';
  const al = a.content.split('\n'), bl = b.content.split('\n');
  const out = [];
  const max = Math.max(al.length, bl.length);
  for (let i = 0; i < max; i++) {
    if (al[i] !== bl[i]) {
      if (al[i] !== undefined) out.push(`< ${al[i]}`);
      if (bl[i] !== undefined) out.push(`> ${bl[i]}`);
    }
  }
  return out.join('\n');
};

commands.ln = ({args, flags}) => {
  const src = getNode(resolveSegments(args[0]));
  if (!src) throw { msg: `ln: failed to access '${args[0]}': No such file or directory` };
  const dstSegs = resolveSegments(args[1]);
  const { parent, name } = getParentAndName(dstSegs);
  if (!parent) throw { msg: `ln: cannot create link` };
  parent.children[name] = deepCopy(src);
  return '';
};

commands.tar = ({args}) => {
  if (args.includes('-c') || args[0]?.includes('c')) return `tar: (simulated) created archive ${args[args.length-1]}`;
  if (args.includes('-x') || args[0]?.includes('x')) return `tar: (simulated) extracted archive`;
  return 'tar: usage: tar -czf archive.tar.gz files...  |  tar -xzf archive.tar.gz';
};

commands.exit = () => ({ sys: 'logout\nConnection closed (simulated). Reload the page to start a new session.' });

/* ============================================================
   7. EXECUTION ENGINE (handles pipes + redirection + aliases)
   ============================================================ */

function runSingle(tokens, stdin) {
  if (!tokens.length) return { out: '' };
  let [cmdName, ...rest] = tokens;

  if (shellState.aliases[cmdName] && cmdName !== 'alias') {
    const expanded = tokenize(shellState.aliases[cmdName]);
    tokens = expanded.concat(rest);
    cmdName = tokens[0];
    rest = tokens.slice(1);
  }

  const fn = commands[cmdName];
  if (!fn) return { err: `${cmdName}: command not found` };

  const { flags, args } = splitFlagsArgs(rest);
  try {
    const result = fn({ args, flags, tokens: rest, stdin });
    if (result && typeof result === 'object' && !Array.isArray(result)) return { out: result.out ?? '', ...result };
    return { out: result ?? '' };
  } catch (e) {
    return { err: e && e.msg ? e.msg : String(e) };
  }
}

function runLine(line, isSudo) {
  const pipelineParts = splitPipeline(line);
  let stdin = undefined;
  let last = { out: '' };
  for (const part of pipelineParts) {
    const tokensRaw = tokenize(part);
    const { tokens, redirect } = parseRedirection(tokensRaw);
    last = runSingle(tokens, stdin);
    if (last.err) return last;
    if (last.clear || last.sys) return last;
    stdin = last.out;
    if (redirect) {
      const segs = resolveSegments(redirect.target);
      const { parent, name } = getParentAndName(segs);
      if (parent) {
        const content = (redirect.type === '>>' && parent.children[name]?.type === 'file')
          ? parent.children[name].content + last.out + '\n'
          : last.out + '\n';
        parent.children[name] = makeFile(content);
      }
      stdin = '';
      last.out = '';
    }
  }
  return last;
}

/* ============================================================
   8. TERMINAL UI
   ============================================================ */

const outputEl = document.getElementById('terminal-output');
const inputEl = document.getElementById('terminal-input');
const promptLabelEl = document.getElementById('prompt-label');

function updatePromptLabel() {
  promptLabelEl.textContent = `student@linux-practice:${displayPath(cwdPath)}$`;
}
updatePromptLabel();

function appendLine(html, cls) {
  const div = document.createElement('div');
  div.className = 'line ' + (cls || 'line-out');
  div.innerHTML = html;
  outputEl.appendChild(div);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let historyIdx = -1;

function executeLine(line) {
  const trimmed = line.trim();
  appendLine(`<span class="p">student@linux-practice:${displayPath(cwdPath)}$</span> ${escapeHtml(line)}`, 'line-cmd');
  if (!trimmed) return;
  shellState.history.push(trimmed);
  historyIdx = shellState.history.length;

  const result = runLine(trimmed);

  if (result.clear) { outputEl.innerHTML = ''; return; }
  if (result.sys) { appendLine(escapeHtml(result.sys), 'line-sys'); return; }
  if (result.err) { appendLine(escapeHtml(result.err), 'line-err'); return; }
  if (result.out) appendLine(escapeHtml(result.out), 'line-out');
  updatePromptLabel();
}

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = inputEl.value;
    inputEl.value = '';
    executeLine(val);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIdx > 0) { historyIdx--; inputEl.value = shellState.history[historyIdx] || ''; }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIdx < shellState.history.length - 1) { historyIdx++; inputEl.value = shellState.history[historyIdx] || ''; }
    else { historyIdx = shellState.history.length; inputEl.value = ''; }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const val = inputEl.value;
    const parts = val.split(' ');
    const last = parts[parts.length-1];
    if (parts.length === 1) {
      const matches = Object.keys(commands).filter(c => c.startsWith(last));
      if (matches.length === 1) inputEl.value = matches[0] + ' ';
    }
  }
});

outputEl.parentElement.addEventListener('click', () => inputEl.focus());

// greet
appendLine(`Linux Practice Terminal — simulated shell. Type <b>help</b> to get started, or open the "All Commands" tab.`, 'line-sys');
appendLine('', 'line-out');

/* ============================================================
   9. COMMAND REFERENCE DATABASE ("All Commands" tab)
   ============================================================ */

const COMMAND_DB = [
  // ---- Navigation & File/Directory ----
  { name:'pwd', cat:'Navigation', short:'print current working directory', syntax:'pwd', description:'Prints the absolute path of the directory you are currently in.', flags:[], pros:['Simple, no side effects','Useful in scripts to capture current location'], cons:['No configuration options — very limited scope'], examples:[['pwd','Show the current directory path']] },
  { name:'ls', cat:'Navigation', short:'list directory contents', syntax:'ls [OPTIONS] [PATH]', description:'Lists files and directories inside the given path (or current directory by default).', flags:[['-l','Long listing: permissions, owner, size, date'],['-a','Show hidden files (dotfiles)'],['-la','Combine long + all'],['-h','Human-readable sizes (with -l)']], pros:['Fast way to inspect a directory','Many flags for different levels of detail'], cons:['Output format differs slightly across distros/shells'], examples:[['ls','List current directory'],['ls -la','Detailed listing including hidden files'],['ls /etc','List contents of /etc']] },
  { name:'cd', cat:'Navigation', short:'change directory', syntax:'cd [PATH]', description:'Changes the current working directory. Supports relative paths, absolute paths, ~ for home, and .. for parent.', flags:[['~','Go to home directory'],['..','Go to parent directory'],['-','Go to previous directory (real bash only)']], pros:['Essential for navigating the filesystem'], cons:['No output on success, which can be confusing for beginners'], examples:[['cd Documents','Move into Documents'],['cd ..','Move up one level'],['cd ~','Jump to home directory']] },
  { name:'mkdir', cat:'File Management', short:'make directories', syntax:'mkdir [OPTIONS] DIR...', description:'Creates one or more new directories.', flags:[['-p','Create parent directories as needed, no error if exists']], pros:['Quick directory creation','-p avoids multi-step creation of nested paths'], cons:['Without -p, fails if parent directories are missing'], examples:[['mkdir project','Create a folder named project'],['mkdir -p a/b/c','Create nested folders in one command']] },
  { name:'rmdir', cat:'File Management', short:'remove empty directories', syntax:'rmdir DIR...', description:'Removes empty directories only. Fails if the directory has any content.', flags:[], pros:['Safe — will never delete something with data inside'], cons:['Cannot remove non-empty directories (use rm -r instead)'], examples:[['rmdir old_folder','Remove an empty folder']] },
  { name:'touch', cat:'File Management', short:'create empty file / update timestamp', syntax:'touch FILE...', description:'Creates an empty file if it does not exist, or updates its modification timestamp if it does.', flags:[], pros:['Fast way to create placeholder files','Non-destructive on existing files'], cons:['Does not let you add content directly'], examples:[['touch notes.txt','Create an empty file'],['touch a.txt b.txt','Create multiple files at once']] },
  { name:'rm', cat:'File Management', short:'remove files or directories', syntax:'rm [OPTIONS] PATH...', description:'Deletes files. With -r, deletes directories and their contents recursively.', flags:[['-r','Recursive — required to delete directories'],['-f','Force — ignore nonexistent files, never prompt']], pros:['Powerful, scriptable deletion'], cons:['DESTRUCTIVE and irreversible — there is no Recycle Bin','rm -rf is famous for catastrophic mistakes if misused'], examples:[['rm file.txt','Delete a single file'],['rm -r old_project/','Delete a folder and everything inside it']] },
  { name:'cp', cat:'File Management', short:'copy files/directories', syntax:'cp [OPTIONS] SRC DEST', description:'Copies a file (or, with -r, a directory tree) from source to destination.', flags:[['-r','Recursive copy for directories'],['-v','Verbose — print each file copied']], pros:['Keeps the original in place','Works on whole directory trees with -r'], cons:['Silently overwrites destination files by default'], examples:[['cp a.txt b.txt','Copy a.txt to a new file b.txt'],['cp -r src/ backup/','Copy an entire folder']] },
  { name:'mv', cat:'File Management', short:'move or rename files', syntax:'mv SRC DEST', description:'Moves a file/directory to a new location, or renames it if DEST is in the same directory.', flags:[], pros:['Doubles as the rename command','Fast — does not duplicate data on the same filesystem'], cons:['Overwrites destination without warning by default'], examples:[['mv old.txt new.txt','Rename a file'],['mv file.txt Documents/','Move a file into a folder']] },
  { name:'find', cat:'Search', short:'search for files in a directory tree', syntax:'find PATH -name PATTERN', description:'Recursively searches a directory tree for files/directories matching criteria such as name.', flags:[['-name','Match by filename (supports * wildcard)'],['-type','Filter by type: f (file) or d (directory)']], pros:['Extremely powerful and flexible','Searches recursively by default'], cons:['Syntax is less intuitive than grep for beginners'], examples:[['find . -name "*.txt"','Find all .txt files from current directory down'],['find /home -type d','List all directories under /home']] },
  { name:'grep', cat:'Search', short:'search text using patterns', syntax:'grep [OPTIONS] PATTERN [FILE]', description:'Searches input (a file or piped text) for lines matching a pattern/regular expression.', flags:[['-i','Case-insensitive search'],['-v','Invert match — show non-matching lines'],['-r','Recursive search through directories']], pros:['Extremely fast text search','Supports full regular expressions'], cons:['Regex syntax has a learning curve'], examples:[['grep "error" log.txt','Find lines containing "error"'],['ls | grep ".txt"','Filter ls output for .txt files']] },
  { name:'cat', cat:'Viewing Files', short:'concatenate and print files', syntax:'cat FILE...', description:'Prints file contents to the terminal. With multiple files, prints them one after another.', flags:[], pros:['Simplest way to view a small file','Can concatenate multiple files together'], cons:['Impractical for very large files (dumps everything at once)'], examples:[['cat notes.txt','Print file contents'],['cat a.txt b.txt > merged.txt','Combine two files into one']] },
  { name:'head', cat:'Viewing Files', short:'show first lines of a file', syntax:'head FILE', description:'Displays the first 10 lines of a file by default.', flags:[['-n','Number of lines to show']], pros:['Quick preview of large files without loading everything'], cons:['Simulated version here always shows 10 lines'], examples:[['head server.log','Preview the start of a log file']] },
  { name:'tail', cat:'Viewing Files', short:'show last lines of a file', syntax:'tail FILE', description:'Displays the last 10 lines of a file by default — very useful for logs.', flags:[['-n','Number of lines to show'],['-f','Follow the file as it grows (real systems only)']], pros:['Ideal for checking recent log entries'], cons:['-f (follow mode) is not supported in this simulator'], examples:[['tail server.log','Show the most recent log lines']] },
  { name:'less', cat:'Viewing Files', short:'paginated file viewer', syntax:'less FILE', description:'Opens a file for scrollable, paginated viewing without loading it all on screen at once.', flags:[], pros:['Efficient for huge files on a real system','Searchable while viewing'], cons:['In this simulator it behaves like cat (prints full content)'], examples:[['less bigfile.txt','Page through a large file']] },
  { name:'wc', cat:'Text Processing', short:'word, line, character count', syntax:'wc [OPTIONS] FILE', description:'Counts lines, words, and characters/bytes in a file or input stream.', flags:[['-l','Count lines only'],['-w','Count words only'],['-c','Count bytes/characters only']], pros:['Fast statistics on text data','Works well with pipes'], cons:['Only gives counts, no content details'], examples:[['wc -l file.txt','Count lines in a file'],['cat file.txt | wc -w','Count words via pipe']] },
  { name:'sort', cat:'Text Processing', short:'sort lines of text', syntax:'sort [FILE]', description:'Sorts the lines of a file or input alphabetically (or numerically with -n on real systems).', flags:[], pros:['Simple, composable with pipes'], cons:['Default sort is lexicographic, which can surprise with numbers'], examples:[['sort names.txt','Sort a file alphabetically']] },
  { name:'uniq', cat:'Text Processing', short:'remove duplicate adjacent lines', syntax:'uniq [FILE]', description:'Filters out repeated, consecutive lines. Usually used after sort.', flags:[], pros:['Cheap way to deduplicate sorted data'], cons:['Only removes ADJACENT duplicates — sort first for full dedup'], examples:[['sort file.txt | uniq','Sort then remove duplicate lines']] },
  { name:'chmod', cat:'Permissions', short:'change file permissions', syntax:'chmod MODE FILE', description:'Changes read/write/execute permissions on a file or directory, using symbolic (rwx) or numeric (755) notation.', flags:[['755','rwx for owner, rx for group/others'],['644','rw for owner, r for group/others']], pros:['Fine-grained control over access'], cons:['Numeric mode is confusing for beginners','Wrong permissions can break scripts/services'], examples:[['chmod 755 script.sh','Make a script executable by owner, readable by others'],['chmod 644 file.txt','Standard read/write for owner, read-only for others']] },
  { name:'chown', cat:'Permissions', short:'change file owner/group', syntax:'chown USER:GROUP FILE', description:'Changes the owner and/or group of a file or directory. Usually requires sudo on real systems.', flags:[], pros:['Necessary for multi-user permission management'], cons:['Requires root/sudo privileges on real systems'], examples:[['chown student:student file.txt','Set owner and group to student']] },
  { name:'ps', cat:'Process Management', short:'list running processes', syntax:'ps [OPTIONS]', description:'Displays a snapshot of currently running processes.', flags:[['aux','Show all processes for all users, with details (real systems)']], pros:['Quick process overview'], cons:['Static snapshot — does not update automatically (use top instead)'], examples:[['ps','List processes in the current shell']] },
  { name:'top', cat:'Process Management', short:'live process/resource monitor', syntax:'top', description:'Shows a live, continuously updating view of running processes and system resource usage.', flags:[], pros:['Great for spotting resource-hungry processes in real time'], cons:['Can be intimidating for beginners; text-heavy interface'], examples:[['top','Open the live process monitor']] },
  { name:'kill', cat:'Process Management', short:'terminate a process', syntax:'kill PID', description:'Sends a termination signal to a process by its process ID.', flags:[['-9','Force kill (SIGKILL) — cannot be ignored by the process']], pros:['Direct way to stop a misbehaving process'], cons:['-9 skips graceful shutdown and can cause data loss on real systems'], examples:[['kill 1190','Ask process 1190 to terminate'],['kill -9 1190','Force-kill process 1190']] },
  { name:'df', cat:'System Info', short:'report disk space usage', syntax:'df [OPTIONS]', description:'Shows available and used disk space for mounted filesystems.', flags:[['-h','Human-readable sizes (KB/MB/GB)']], pros:['Quick way to check if a disk is full'], cons:['Reports per-filesystem, not per-folder (use du for that)'], examples:[['df -h','Show disk usage in human-readable form']] },
  { name:'du', cat:'System Info', short:'estimate file/directory space usage', syntax:'du [OPTIONS] [PATH]', description:'Shows how much disk space a file or directory (including subdirectories) is using.', flags:[['-h','Human-readable sizes'],['-s','Summarize — show only the total for the given path']], pros:['Great for finding what is eating up disk space'], cons:['Can be slow on very large directory trees on real systems'], examples:[['du -sh Documents/','Show total size of a folder']] },
  { name:'free', cat:'System Info', short:'display memory usage', syntax:'free [OPTIONS]', description:'Shows total, used, and free physical and swap memory.', flags:[['-h','Human-readable sizes']], pros:['Fast memory health check'], cons:['Raw output can be confusing (buffers/cache vs "free")'], examples:[['free -h','Show memory usage in human-readable form']] },
  { name:'uname', cat:'System Info', short:'print system information', syntax:'uname [OPTIONS]', description:'Prints information about the system, such as kernel name and version.', flags:[['-a','Print all available system information']], pros:['Quick way to identify the OS/kernel'], cons:['Limited detail compared to tools like lsb_release'], examples:[['uname -a','Show full system/kernel info']] },
  { name:'hostname', cat:'System Info', short:'show or set system hostname', syntax:'hostname', description:'Prints the name of the current host/machine on the network.', flags:[], pros:['Simple identification of the machine'], cons:['Changing it usually requires root/sudo on real systems'], examples:[['hostname','Print the machine name']] },
  { name:'whoami', cat:'System Info', short:'print effective username', syntax:'whoami', description:'Prints the username of the currently logged-in user.', flags:[], pros:['Simple identity check, useful in scripts'], cons:['Very narrow purpose'], examples:[['whoami','Show the current user']] },
  { name:'date', cat:'System Info', short:'print or set system date/time', syntax:'date', description:'Displays the current date and time.', flags:[], pros:['Useful for logging and timestamps in scripts'], cons:['Setting the date requires root on real systems'], examples:[['date','Show the current date and time']] },
  { name:'man', cat:'Help', short:'display the manual for a command', syntax:'man COMMAND', description:'Opens the manual page describing a command in detail: synopsis, options, examples.', flags:[], pros:['Authoritative, always-available documentation'], cons:['Dense formatting can be hard to read for beginners'], examples:[['man ls','Read the manual page for ls']] },
  { name:'history', cat:'Shell', short:'show command history', syntax:'history', description:'Lists previously executed commands in the current session, numbered.', flags:[], pros:['Handy for recalling and reusing past commands'], cons:['In real bash, history persists across sessions via a file — this simulator resets on reload'], examples:[['history','List commands run so far']] },
  { name:'alias', cat:'Shell', short:'create a command shortcut', syntax:"alias name='command'", description:'Defines a shortcut name for a longer command or command with options.', flags:[], pros:['Saves typing for frequently used commands'], cons:['Aliases only exist for the current session unless saved to a config file'], examples:[["alias ll='ls -la'",'Create ll as a shortcut for ls -la']] },
  { name:'export', cat:'Shell', short:'set an environment variable', syntax:'export VAR=value', description:'Sets an environment variable that is available to the shell and programs it launches.', flags:[], pros:['Standard way to configure environment-driven behavior'], cons:['Exported variables are lost when the shell session ends unless persisted'], examples:[['export EDITOR=nano','Set the default editor variable']] },
  { name:'env', cat:'Shell', short:'display environment variables', syntax:'env', description:'Prints all environment variables currently set in the shell.', flags:[], pros:['Useful for debugging environment-related issues'], cons:['Output can be long and hard to scan'], examples:[['env','List all environment variables']] },
  { name:'echo', cat:'Shell', short:'print text to the terminal', syntax:'echo [TEXT]', description:'Prints the given text. Commonly used with redirection to write into files.', flags:[['-n','Do not print the trailing newline']], pros:['Simple, foundational building block for scripts'], cons:['Quoting rules can be tricky with special characters'], examples:[['echo "Hello World"','Print text to the screen'],['echo "data" > file.txt','Write text into a file (overwrite)']] },
  { name:'which', cat:'Shell', short:'locate a command\'s executable', syntax:'which COMMAND', description:'Shows the full path of the executable that would run for a given command name.', flags:[], pros:['Useful to confirm which version of a tool is being used'], cons:['Only checks PATH — will not find scripts outside it'], examples:[['which python3','Show the path to the python3 executable']] },
  { name:'clear', cat:'Shell', short:'clear the terminal screen', syntax:'clear', description:'Clears all previous output from the terminal screen.', flags:[], pros:['Keeps the terminal tidy during long sessions'], cons:['Does not clear scrollback/history, only the visible screen'], examples:[['clear','Clear the screen']] },
  { name:'sudo', cat:'Permissions', short:'execute a command as another user (root)', syntax:'sudo COMMAND', description:'Runs a command with elevated (administrator/root) privileges.', flags:[], pros:['Lets a normal user perform admin tasks without logging in as root'], cons:['Powerful — mistakes with sudo can break the whole system','This simulator does not enforce real privilege checks'], examples:[['sudo apt update','Run a privileged package update']] },
  { name:'apt', cat:'Package Management', short:'Debian/Ubuntu package manager', syntax:'apt install|update|upgrade PACKAGE', description:'Installs, updates, and manages software packages on Debian-based distributions (e.g. Ubuntu).', flags:[], pros:['Handles dependencies automatically','Large official repositories'], cons:['Debian/Ubuntu-specific — other distros use yum/dnf/pacman'], examples:[['sudo apt update','Refresh the package list'],['sudo apt install git','Install a package (simulated)']] },
  { name:'tar', cat:'Compression', short:'archive files', syntax:'tar -czf archive.tar.gz files...', description:'Bundles multiple files/directories into a single archive, optionally compressed with gzip.', flags:[['-c','Create a new archive'],['-x','Extract an archive'],['-z','Use gzip compression'],['-f','Specify the archive filename']], pros:['Standard, universally available on Linux','Preserves permissions and directory structure'], cons:['Flag combinations (czf/xzf) are easy to mix up for beginners'], examples:[['tar -czf backup.tar.gz Documents/','Create a compressed archive'],['tar -xzf backup.tar.gz','Extract a compressed archive']] },
  { name:'ping', cat:'Networking', short:'test network connectivity', syntax:'ping HOST', description:'Sends ICMP echo requests to a host to test reachability and measure latency.', flags:[], pros:['Quick, universal network diagnostic'], cons:['Some networks/firewalls block ICMP, giving false negatives'], examples:[['ping google.com','Test connectivity to a host (simulated, no real network access)']] },
  { name:'ifconfig', cat:'Networking', short:'display/configure network interfaces', syntax:'ifconfig', description:'Shows network interface configuration such as IP address, netmask, and status. (Deprecated in favor of "ip" on modern distros.)', flags:[], pros:['Familiar, classic tool'], cons:['Considered legacy — many distros now prefer the "ip" command'], examples:[['ifconfig','Show network interfaces']] },
  { name:'ip', cat:'Networking', short:'modern network configuration tool', syntax:'ip a', description:'Displays or configures network interfaces, routing, and addresses. The modern replacement for ifconfig/route.', flags:[['a','Show addresses for all interfaces']], pros:['More powerful and actively maintained than ifconfig'], cons:['Syntax is less intuitive at first than the older tools'], examples:[['ip a','Show all network interfaces and addresses']] },
  { name:'curl', cat:'Networking', short:'transfer data from/to a server', syntax:'curl URL', description:'Fetches data from a URL — commonly used to test APIs or download files from the command line.', flags:[], pros:['Extremely versatile: supports HTTP, FTP, headers, auth, etc.'], cons:['Real network access is disabled in this practice terminal'], examples:[['curl https://example.com','Fetch a URL (simulated — no real network access)']] },
  { name:'wget', cat:'Networking', short:'download files from the web', syntax:'wget URL', description:'Downloads files from a URL directly to disk, with support for resuming interrupted downloads.', flags:[], pros:['Good for downloading files/scripts non-interactively'], cons:['Real network access is disabled in this practice terminal'], examples:[['wget https://example.com/file.zip','Download a file (simulated)']] },
  { name:'diff', cat:'Text Processing', short:'compare two files line by line', syntax:'diff FILE1 FILE2', description:'Shows the differences between two text files, line by line.', flags:[], pros:['Essential for spotting changes between file versions'], cons:['Raw output format takes practice to read fluently'], examples:[['diff old.txt new.txt','Show differences between two files']] },
  { name:'ln', cat:'File Management', short:'create links between files', syntax:'ln [-s] TARGET LINK_NAME', description:'Creates a link to a file. Hard links share the same data; symbolic links (-s) point to a path.', flags:[['-s','Create a symbolic (soft) link instead of a hard link']], pros:['Lets multiple names/locations reference the same file'], cons:['Hard vs symbolic link behavior is a common beginner confusion'], examples:[['ln -s target.txt shortcut.txt','Create a symbolic link (simulated as a copy here)']] },
  { name:'tree', cat:'Navigation', short:'display directory structure as a tree', syntax:'tree [PATH]', description:'Recursively lists the contents of a directory in an indented, tree-like format.', flags:[], pros:['Great visual overview of a project structure'], cons:['Not installed by default on every distro (often needs installing)'], examples:[['tree','Show the tree for the current directory']] },
  { name:'nano', cat:'Text Editors', short:'simple terminal text editor', syntax:'nano FILE', description:'A beginner-friendly, terminal-based text editor with on-screen shortcut hints.', flags:[], pros:['Very easy to learn compared to vi/vim'], cons:['Less powerful than vim/emacs for advanced editing','Not a full interactive editor in this simulator'], examples:[['nano notes.txt','Open a file for editing (simulated)']] },
  { name:'vim', cat:'Text Editors', short:'powerful modal text editor', syntax:'vim FILE', description:'A highly efficient, modal text editor favored by many experienced Linux users.', flags:[], pros:['Extremely fast for experienced users','Available on virtually every Linux system'], cons:['Steep learning curve (modes, keybindings)','Not a full interactive editor in this simulator'], examples:[['vim notes.txt','Open a file for editing (simulated)']] },
];

const catFilter = document.getElementById('category-filter');
const categories = [...new Set(COMMAND_DB.map(c => c.cat))].sort();
categories.forEach(c => {
  const opt = document.createElement('option');
  opt.value = c; opt.textContent = c;
  catFilter.appendChild(opt);
});

const commandsListEl = document.getElementById('commands-list');
const commandDetailEl = document.getElementById('command-detail');
const searchEl = document.getElementById('command-search');

function renderCommandList() {
  const q = searchEl.value.trim().toLowerCase();
  const cat = catFilter.value;
  commandsListEl.innerHTML = '';
  const list = COMMAND_DB
    .filter(c => cat === 'all' || c.cat === cat)
    .filter(c => !q || c.name.includes(q) || c.short.toLowerCase().includes(q))
    .sort((a,b) => a.name.localeCompare(b.name));

  if (!list.length) {
    commandsListEl.innerHTML = '<div class="cmd-item">No commands match.</div>';
    return;
  }
  list.forEach(c => {
    const div = document.createElement('div');
    div.className = 'cmd-item';
    div.dataset.name = c.name;
    div.innerHTML = `<span class="cmd-name">${c.name}</span><span class="cmd-cat">${c.cat} — ${c.short}</span>`;
    div.addEventListener('click', () => selectCommand(c.name));
    commandsListEl.appendChild(div);
  });
}

function selectCommand(name) {
  const c = COMMAND_DB.find(x => x.name === name);
  if (!c) return;
  document.querySelectorAll('.cmd-item').forEach(el => el.classList.toggle('selected', el.dataset.name === name));

  const flagsRows = c.flags.length
    ? `<table class="cd-flags"><tr><th>Option</th><th>Meaning</th></tr>${c.flags.map(f => `<tr><td class="flag-code">${f[0]}</td><td>${f[1]}</td></tr>`).join('')}</table>`
    : '<p>This command has no commonly used flags covered here.</p>';

  const examplesRows = c.examples.map(e => `<div class="ex-row"><div class="ex-cmd">$ ${e[0]}</div><div class="ex-desc">${e[1]}</div></div>`).join('');

  commandDetailEl.innerHTML = `
    <h2>${c.name}</h2>
    <div class="cd-category">${c.cat}</div>
    <div class="cd-syntax">${c.syntax}</div>
    <p>${c.description}</p>
    <h3>Common Options</h3>
    ${flagsRows}
    <h3>Pros &amp; Cons</h3>
    <div class="pros-cons">
      <div><h4>Pros</h4><ul>${c.pros.map(p => `<li>${p}</li>`).join('')}</ul></div>
      <div><h4>Cons</h4><ul>${c.cons.map(p => `<li>${p}</li>`).join('')}</ul></div>
    </div>
    <h3>Usage Examples</h3>
    <div class="cd-examples">${examplesRows}</div>
    <button class="cd-try-btn" id="cd-try-btn">TRY IN TERMINAL →</button>
  `;
  document.getElementById('cd-try-btn').addEventListener('click', () => {
    document.querySelector('.tab-btn[data-tab="terminal-tab"]').click();
    inputEl.value = c.examples[0] ? c.examples[0][0] : c.name;
    inputEl.focus();
  });
}

searchEl.addEventListener('input', renderCommandList);
catFilter.addEventListener('change', renderCommandList);
renderCommandList();

/* ============================================================
   10. FILE MANAGER TAB
   ============================================================ */

let fmPath = ['home', 'student'];

function renderFileManager() {
  const pathEl = document.getElementById('fm-path');
  const listingEl = document.getElementById('fm-listing');
  pathEl.textContent = pathString(fmPath) || '/';

  const node = getNode(fmPath);
  listingEl.innerHTML = '';
  if (!node || node.type !== 'dir') {
    listingEl.innerHTML = '<div class="fm-empty">Directory not found.</div>';
    return;
  }
  const names = Object.keys(node.children).sort((a,b) => {
    const da = node.children[a].type === 'dir', db = node.children[b].type === 'dir';
    if (da !== db) return da ? -1 : 1;
    return a.localeCompare(b);
  });

  if (!names.length) {
    listingEl.innerHTML = '<div class="fm-empty">This directory is empty.</div>';
    return;
  }

  names.forEach(name => {
    const child = node.children[name];
    const row = document.createElement('div');
    row.className = 'fm-row' + (child.type === 'dir' ? ' is-dir' : '');
    const icon = child.type === 'dir' ? '▸' : '▪';
    row.innerHTML = `
      <span class="fm-col-name">${icon} ${name}${child.type === 'dir' ? '/' : ''}</span>
      <span class="fm-col-type">${child.type === 'dir' ? 'Directory' : 'File'}</span>
      <span class="fm-col-perm">${child.perms}</span>
      <span class="fm-col-size">${humanSize(nodeSize(child))}</span>
      <span class="fm-col-mod">${child.mtime}</span>
    `;
    if (child.type === 'dir') {
      row.addEventListener('click', () => { fmPath = fmPath.concat(name); renderFileManager(); });
    }
    listingEl.appendChild(row);
  });
}

document.getElementById('fm-up-btn').addEventListener('click', () => {
  if (fmPath.length) fmPath.pop();
  renderFileManager();
});
document.getElementById('fm-refresh-btn').addEventListener('click', renderFileManager);
