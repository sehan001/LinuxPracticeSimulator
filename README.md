# Linux Practice Terminal

A **browser-based, simulated Linux terminal** built with plain HTML, CSS, and
JavaScript — no backend, no real shell, no real filesystem. It's designed as
a safe sandbox for learning Linux commands.

> ⚠️ **Disclaimer:** This project is for **learning purposes only**. It does
> not execute anything on a real operating system. All commands run against
> an in-memory virtual filesystem that resets when the page is reloaded.

---

## Features

The app opens with a disclaimer screen (click **OK, START PRACTICING** to
continue), then presents a classic black-and-white terminal window with
three tabs:

### 1. Terminal
A working shell prompt (`student@linux-practice:~$`) that supports:
- Navigation: `pwd`, `cd`, `ls` (`-l`, `-a`, `-la`)
- File management: `mkdir`, `touch`, `rm`, `rmdir`, `cp`, `mv`, `ln`, `tree`
- Viewing files: `cat`, `head`, `tail`, `less`, `more`
- Text processing: `grep`, `find`, `wc`, `sort`, `uniq`, `diff`
- Permissions: `chmod`, `chown`, `sudo`
- Process/system info: `ps`, `top`, `kill`, `df`, `du`, `free`, `uname`,
  `hostname`, `whoami`, `date`
- Shell basics: `echo`, `export`, `env`, `alias`, `history`, `which`,
  `whereis`, `clear`, `help`, `man`
- Package management (simulated): `apt`, `apt-get`
- Networking (simulated, no real network access): `ping`, `ifconfig`, `ip`,
  `curl`, `wget`
- Archives (simulated): `tar`
- Text editors (simulated placeholder): `nano`, `vim`, `vi`
- **Pipes** (`ls | grep txt`) and **redirection** (`>`, `>>`)
- Command history with **Up / Down arrow** keys
- **Tab** completion for command names

### 2. All Commands
A searchable, filterable reference of 60+ Linux commands. Each entry
includes:
- Syntax
- Description
- Common options/flags
- Pros and cons
- Real usage examples (with a **"Try in Terminal"** button that jumps to
  the Terminal tab and pre-fills the example command)

### Title bar controls
- **⟳ RESTART** — wipes the virtual filesystem, command history, environment
  variables and terminal output back to the original starting state (with a
  confirmation prompt first, since it's destructive to anything you built).
- **🎨 THEME** — opens a dropdown to switch the terminal's color palette and
  border style: Classic Mono (default, matches the original brief), Hacker
  Green, Amber Retro, Cyberpunk Neon, and Matrix Rain (adds an animated
  falling-code background, similar to classic "hacker terminal" widgets).

### 3. File Manager
A read-only visual browser for the same virtual filesystem the Terminal tab
operates on. It shows name, type, permissions, size, and modified date, and
lets you click into folders. Any changes made via Terminal commands
(`mkdir`, `touch`, `rm`, `cp`, `mv`, etc.) are reflected here — click
**REFRESH** or switch tabs to update the view.

---

## File structure

```
linux-practice-terminal/
├── index.html   # Page structure: disclaimer, tabs, terminal, commands, file manager
├── style.css    # Black & white, terminal/command-prompt themed styling
├── script.js    # Virtual filesystem, command engine, UI logic, command reference data
└── README.md    # This file
```

## Running it

No build step or server required. Just open `index.html` in any modern
browser (Chrome, Firefox, Edge, Safari).

## How the simulation works

- **Virtual filesystem:** a plain JavaScript object tree (`FS.root`)
  represents directories and files in memory. Each command manipulates this
  tree instead of touching real files.
- **Command engine:** user input is tokenized (respecting quotes), split on
  pipes (`|`) and redirection (`>`, `>>`), and dispatched to a table of
  command functions (`commands.ls`, `commands.cd`, etc.).
- **State resets on reload:** since everything lives in memory (by design —
  no data is sent anywhere, and no browser storage is used), refreshing the
  page gives you a clean starting filesystem again.
- **Simulated-only commands:** things that would require real system/network
  access (`ping`, `curl`, `wget`, `apt install`, `sudo`, editors like `nano`/
  `vim`) print realistic-looking output but don't perform real actions.

## Extending it

- Add a new command: define a function in the `commands` object in
  `script.js` (see existing ones like `commands.mkdir` for the pattern), and
  optionally add a matching entry to the `COMMAND_DB` array so it shows up
  in the "All Commands" tab.
- Adjust styling: all colors are grayscale CSS variables at the top of
  `style.css` (`--black`, `--white`, `--dim`, etc.) for easy theming while
  staying black & white.

---

Built as a learning tool. It is **not** a substitute for practicing on a
real Linux machine or virtual machine once you're comfortable with the
basics.
