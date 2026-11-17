import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { appHome, agents, checking, exec, keys, readTextFile, run, spaces, theme, window } from "herdr";

// Rate limits are not built in: `rate-limits.json` (in the app home) names providers, and
// each one runs a command that prints what to show:
//
//   { "title": "go",
//     "limits": [ { "label": "5h", "used": 12, "resets_at": 1763000000, "status": "ok" },
//                 { "label": "7d", "used": 4 } ] }
//
// `used` is the percent used (0..100), `resets_at` is epoch seconds (optional), `status`
// may be left out and anything but "ok" marks the limit as flagged. A provider whose command
// fails or prints something else keeps its last numbers, so the bar doesn't blink to nothing
// while the network is busy or down. A provider is one entry in the config plus a command,
// so no two providers need the same source: `examples/rate-limits/` has one script each for
// OpenCode Go and Claude Code.
const CONFIG = "rate-limits.json";
const REFRESH_MS = 60_000;
const TIMEOUT_MS = 15_000;

export default class RateStatus extends View {
  init(_props, cx) {
    this.rates = [];
    this.busy = false;
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        let config = null;
        try {
          const text = await readTextFile(`${appHome()}/${CONFIG}`);
          config = text ? JSON.parse(text) : null;
        } catch {
          config = null;
        }
        const providers = Array.isArray(config?.providers)
          ? config.providers.filter((p) => p?.name && p?.command)
          : [];
        const last = new Map(this.rates.map((r) => [r.name, r]));
        const next = [];
        for (const provider of providers) {
          try {
            const r = await exec("sh", ["-c", provider.command], { timeout: provider.timeout ?? TIMEOUT_MS });
            const data = r.code === 0 ? JSON.parse(r.stdout) : null;
            const limits = (Array.isArray(data?.limits) ? data.limits : []).filter((l) => l && l.label);
            if (!limits.length) throw new Error("no limits");
            next.push({ name: provider.name, title: data.title ?? provider.name, limits });
          } catch {
            const kept = last.get(provider.name);
            if (kept) next.push(kept);
          }
        }
        this.rates = next;
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  limit(t, id, limit, now) {
    const stale = limit.resets_at != null && limit.resets_at <= now;
    const used = Math.max(0, Math.min(100, Number(limit.used) || 0));
    const flagged = limit.status && limit.status !== "ok";
    const color = flagged ? t.ansi3 : stale ? t.dim : used < 50 ? t.ansi4 : used < 80 ? t.ansi3 : t.ansi1;
    const filled = stale ? 0 : Math.min(5, Math.round(used / 20));
    return h_flex().id(id).gap(6).items_center()
      .child(div().text_color(t.dim).child(limit.label))
      .child(div().text_color(color).child("▰".repeat(filled) + "▱".repeat(5 - filled)))
      .child(div().text_color(color).child(stale ? "-" : `${Math.round(used)}%`));
  }

  segment(t, rate, now) {
    const left = rate.limits
      .filter((l) => l.resets_at > now && l.resets_at - now < 86_400)
      .sort((a, b) => a.resets_at - b.resets_at)[0];
    return h_flex().id(`rate-${rate.name}`).gap(10).items_center()
      .child(div().text_color(t.muted).child(rate.title))
      .children(rate.limits.map((l) => this.limit(t, `rate-${rate.name}-${l.label}`, l, now)))
      .when(Boolean(left), (el) => {
        const minutes = Math.max(0, Math.round((left.resets_at - now) / 60));
        return el.child(div().text_color(t.dim).child(`↻ ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`));
      });
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = theme();
    const now = Date.now() / 1000;
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .children(this.rates.map((rate) => this.segment(t, rate, now)))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
