// Status bar of the "neon-pro" layout: calm, sentence-case, Apple-like.
// Left: machine, branch, agents by status. Right: Claude's remaining quotas
// (5-hour and weekly windows), dev ports (click: the mod in props.ports_mod, if any), palette, date and time.
//
// Quotas: Claude's from ~/.cache/herdr/claude-quota.json, written by
// ~/.claude/statusline-command.sh each time Claude Code redraws its status line;
// Codex's from the newest Codex session log that carries rate limits. opencode is
// signed in with the ChatGPT account, so it draws on that same Codex quota.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, exec, home, readTextFile, props } from "herdr";

// Executables from macOS or installed apps: their ports aren't dev servers.
const SYSTEM = /^(\/System\/|\/usr\/(libexec|sbin)\/|\/Library\/|\/Applications\/|\/sbin\/)/;
const pad = (n) => String(n).padStart(2, "0");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Quotas older than this are shown dimmed: the agent hasn't run for a while.
const STALE = 6 * 3600;

function resetIn(at, nowSec) {
  if (!at) return null;
  const s = Math.max(0, at - nowSec);
  if (s < 3600) return `${Math.ceil(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${pad(Math.floor((s % 3600) / 60))}`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
}

export default class NeonProHud extends View {
  init(_props, cx) {
    this.now = new Date();
    this.quota = null;
    this.codex = null;
    cx.timer.every(15000, (cx) => { this.now = new Date(); cx.notify(); });
    this.ports = [];
    this.scanPorts(cx);
    cx.timer.every(5000, (cx) => this.scanPorts(cx));
    this.readQuota(cx);
    cx.timer.every(20000, (cx) => this.readQuota(cx));
    this.readCodex(cx);
    cx.timer.every(60000, (cx) => this.readCodex(cx));
  }

  readQuota(cx) {
    cx.spawn(async (cx) => {
      let text = null;
      try { text = await readTextFile(`${home()}/.cache/herdr/claude-quota.json`); } catch {}
      let q = null;
      try { q = text ? JSON.parse(text) : null; } catch {}
      const key = JSON.stringify(q);
      if (key === this.quotaKey) return;
      this.quotaKey = key;
      this.quota = q;
      cx.notify();
    });
  }

  // The last rate-limit line of the most recent Codex sessions (last 8 days).
  readCodex(cx) {
    cx.spawn(async (cx) => {
      const script = `cd "$HOME/.codex/sessions" 2>/dev/null || exit 0
for f in $(find . -name 'rollout-*.jsonl' -mtime -8 2>/dev/null | xargs ls -t 2>/dev/null | head -15); do
  l=$(grep '"primary":{' "$f" | tail -1)
  [ -n "$l" ] && { printf '%s' "$l"; exit 0; }
done`;
      let r = null;
      try { r = await exec("sh", ["-c", script]); } catch { return; }
      let c = null;
      try {
        const line = JSON.parse(r.stdout.trim());
        const rl = line?.payload?.rate_limits;
        if (rl) c = { rl, updated: Math.floor(Date.parse(line.timestamp) / 1000) || null };
      } catch {}
      const key = JSON.stringify(c);
      if (key === this.codexKey) return;
      this.codexKey = key;
      this.codex = c;
      cx.notify();
    });
  }

  scanPorts(cx) {
    cx.spawn(async (cx) => {
      let r;
      try { r = await exec("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]); } catch { return; }
      const byPid = new Map();
      let pid = null;
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("p")) pid = line.slice(1);
        const m = line.match(/^n.*:(\d+)$/);
        if (m && pid) (byPid.get(pid) ?? byPid.set(pid, new Set()).get(pid)).add(Number(m[1]));
      }
      const paths = new Map();
      if (byPid.size) {
        try {
          const ps = await exec("ps", ["-o", "pid=,comm=", "-p", [...byPid.keys()].join(",")]);
          for (const line of ps.stdout.split("\n")) {
            const m = line.trim().match(/^(\d+)\s+(.*)$/);
            if (m) paths.set(m[1], m[2]);
          }
        } catch {}
      }
      const found = new Set();
      for (const [id, ports] of byPid) {
        if (SYSTEM.test(paths.get(id) ?? "")) continue;
        for (const port of ports) if (port < 49152) found.add(port);
      }
      const list = [...found].sort((a, b) => a - b);
      if (list.join() === this.ports.join()) return;
      this.ports = list;
      cx.notify();
    });
  }

  // Color for what's left: calm while there's room, warm when it runs low.
  tone(t, left) {
    return left <= 10 ? t.blocked : left <= 30 ? t.ansi3 : t.done;
  }

  // "5h ▬▬▬▭ 90%": a slim capsule meter of what's left in one window.
  meter(t, win, nowSec, stale) {
    if (win?.used == null) return null;
    // A window whose reset time has passed is full again.
    const passed = win.resets_at && win.resets_at <= nowSec;
    const left = passed ? 100 : Math.max(0, Math.min(100, Math.round(100 - win.used)));
    const c = stale ? t.dim : this.tone(t, left);
    return h_flex().flex_none().gap(6).items_center()
      .child(div().text_color(t.dim).child(win.label))
      .child(div().w(30).h(5).rounded(3).bg("#ffffff12")
        .child(div().h_full().rounded(3).bg(c).w(Math.max(left > 0 ? 3 : 0, (30 * left) / 100))))
      .child(div().w(34).whitespace_nowrap().text_color(stale ? t.dim : left <= 30 ? c : t.foreground).font_medium().child(`${left}%`));
  }

  // One provider's capsule: its icon, then a meter per window. Tooltip: resets.
  capsule(t, id, icon, title, windows, updated, notes = []) {
    const nowSec = Math.floor(this.now.getTime() / 1000);
    const stale = !updated || nowSec - updated > STALE;
    const meters = windows.map((w) => this.meter(t, w, nowSec, stale)).filter(Boolean);
    if (!meters.length) return null;
    const tip = [
      `${title} · quota left`,
      ...windows.filter((w) => w.resets_at && w.used != null).map((w) => `${w.long} resets in ${resetIn(w.resets_at, nowSec)}`),
      ...notes,
      stale ? `Not updated recently: run ${title} to refresh` : null,
    ].filter(Boolean).join("\n");
    return h_flex().id(id).flex_none().h(22).px(8).gap(9).items_center().rounded(7)
      .bg("#ffffff06").border(1).border_color("#ffffff0d")
      .hover((s) => s.bg("#ffffff0d"))
      .tooltip(tip)
      .child(icon.when(stale, (e) => e.opacity(0.45)))
      .children(meters);
  }

  claudeSeg(t) {
    const rl = this.quota?.rate_limits;
    if (!rl) return null;
    return this.capsule(t, "nph-claude", svg("icons/claude.svg").size(12).flex_none().text_color("#d97757"), "Claude", [
      { label: "5h", long: "5-hour window", used: rl.five_hour?.used_percentage, resets_at: rl.five_hour?.resets_at },
      { label: "7d", long: "Weekly window", used: rl.seven_day?.used_percentage, resets_at: rl.seven_day?.resets_at },
    ], this.quota.updated);
  }

  codexSeg(t) {
    const rl = this.codex?.rl;
    if (!rl) return null;
    const win = (w) => {
      if (!w) return null;
      const m = w.window_minutes ?? 0;
      const label = m >= 1440 ? `${Math.round(m / 1440)}d` : `${Math.round(m / 60)}h`;
      const long = m >= 10080 ? "Weekly window" : `${label} window`;
      return { label, long, used: w.used_percent, resets_at: w.resets_at };
    };
    return this.capsule(t, "nph-codex", image("icons/codex.svg").size(12).flex_none().rounded(3), "Codex",
      [win(rl.primary), win(rl.secondary)].filter(Boolean), this.codex.updated,
      ["Shared with opencode (signed in with ChatGPT)", rl.plan_type ? `ChatGPT plan: ${rl.plan_type}` : null]);
  }

  item(t, dot, text, color) {
    return h_flex().flex_none().gap(6).items_center()
      .when(Boolean(dot), (e) => e.child(div().size(6).rounded(3).bg(dot)))
      .child(div().text_color(color ?? t.muted).child(text));
  }

  sep() { return div().flex_none().w(1).h(12).bg("#ffffff12"); }

  render() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const list = agents();
    const n = (st) => list.filter((a) => a.status === st).length;
    const working = n("working"), blocked = n("blocked"), done = n("done");
    const d = this.now;
    const date = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const host = space?.machine ?? "This Mac";
    const agentsText = list.length === 0 ? "No agents" : list.length === 1 ? "1 agent" : `${list.length} agents`;
    const ports = this.ports.length
      ? (this.ports.length > 3 ? `${this.ports.slice(0, 3).map((p) => ":" + p).join("  ")}  +${this.ports.length - 3}` : this.ports.map((p) => ":" + p).join("  "))
      : "No ports";
    const claude = this.claudeSeg(t);
    const codex = this.codexSeg(t);
    const portsMod = props()?.ports_mod;

    return div().size_full().bg(t.chrome).border_t(1).border_color("#ffffff0a")
      .child(h_flex().size_full().px(16).gap(12).items_center().text_size(11.5).text_color(t.muted)
        .child(this.item(t, t.done, host, t.foreground))
        .when(Boolean(space?.branch), (el) => el.child(this.sep())
          .child(h_flex().flex_none().gap(5).items_center()
            .child(svg("mods/neon-pro-chrome/git-branch.svg").size(12).text_color(t.dim))
            .child(div().max_w(180).truncate().child(space.branch))))
        .child(this.sep())
        .child(this.item(t, null, agentsText))
        .when(working > 0, (el) => el.child(this.item(t, t.working, `${working} running`, t.working)))
        .when(done > 0, (el) => el.child(this.item(t, t.done, `${done} done`, t.done)))
        .when(blocked > 0, (el) => el.child(
          h_flex().flex_none().gap(6).items_center().px(8).h(18).rounded(9).bg(t.blocked + "1f")
            .child(div().size(6).rounded(3).bg(t.blocked).loop("opacity", { from: 0.35, to: 1, period: 900 }))
            .child(div().text_color(t.blocked).font_medium().child(`${blocked} need${blocked > 1 ? "" : "s"} you`))))
        .child(div().flex_1())
        .when(Boolean(claude), (el) => el.child(claude))
        .when(Boolean(codex), (el) => el.child(codex))
        .child(h_flex().id("nph-ports").flex_none().px(8).h(22).items_center().rounded(7)
          .text_color(this.ports.length ? t.muted : t.dim)
          .tooltip(portsMod ? "Listening dev ports · click to manage" : "Listening dev ports")
          // Optional: the layout's `props.ports_mod` names a mod to open on click.
          .when(Boolean(portsMod), (el) => el.cursor_pointer()
            .hover((s) => s.bg("#ffffff0d").text_color(t.foreground))
            .on_click(() => run("mod.open", { name: portsMod })))
          .child(ports))
        .child(h_flex().id("nph-palette").flex_none().px(6).h(18).items_center().rounded(5).cursor_pointer()
          .bg("#ffffff0a").text_size(10.5).text_color(t.dim)
          .hover((s) => s.bg("#ffffff14").text_color(t.foreground))
          .tooltip("Command palette")
          .on_click(() => run("app.palette"))
          .child("⇧⌘P"))
        .child(this.sep())
        .child(div().flex_none().text_color(t.dim).child(date))
        .child(div().flex_none().text_color(t.foreground).font_medium().child(clock)));
  }
}
