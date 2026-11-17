import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, props, readTextFile, shared, theme, window, writeTextFile, closeOverlay } from "herdr";

// A dialog for what sits behind the sidebar, the tab bar and the terminals, and how far the
// panels and the terminals let it through. It edits the shown layout's own file
// (`layouts/<name>.json`), which the app reloads at once, and expects that layout to keep
// the default ids: "sidebar", "tabs" and "main". Nothing else in the layout is touched.
const AREAS = [
  { id: "sidebar", label: "Sidebar", none: "chrome" },
  { id: "tabs", label: "Tab bar", none: null },
  { id: "main", label: "Terminals", none: null },
];
const TERMINAL = [0.4, 0.5, 0.6, 0.7, 0.85, 1];
const PANEL = [0.4, 0.55, 0.7, 0.85, 1];
const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const imageOf = (node) => (typeof node?.background === "object" ? node.background.image : null);
const alphaOf = (hex) => (hex?.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1);
const pct = (v) => `${Math.round(v * 100)}%`;

export default class BgSettings extends View {
  init(_props, cx) {
    this.files = [];
    this.tree = null;
    this.text = null;
    this.error = null;
    if (checking()) return;
    cx.spawn(async (cx) => {
      await this.load();
      cx.notify();
    });
  }

  path() {
    return `${appHome()}/layouts/${shared("layout")}.json`;
  }

  folder() {
    return `${appHome()}/backgrounds`;
  }

  async load() {
    this.text = await readTextFile(this.path());
    this.tree = this.text ? JSON.parse(this.text) : null;
    if (!this.tree) this.error = "This layout has no file of its own. Duplicate it first.";
    const win = window()?.platform === "windows";
    const r = win
      ? await exec("cmd", ["/c", "dir", "/b", this.folder().replaceAll("/", "\\")])
      : await exec("ls", ["-1", this.folder()]);
    this.files = (r.stdout ?? "").split(/\r?\n/).map((s) => s.trim()).filter((s) => IMAGE.test(s)).sort();
  }

  // Herdr keeps a layout's look in the file; a write reloads the window.
  save(cx, change) {
    const tree = JSON.parse(JSON.stringify(this.tree));
    change(tree);
    const next = JSON.stringify(tree, null, 2) + "\n";
    cx.spawn(async (cx) => {
      try {
        await writeTextFile(this.path(), next, this.text);
        this.text = next;
        this.tree = tree;
        this.error = null;
      } catch (e) {
        this.error = String(e?.message ?? e);
        await this.load();
      }
      cx.notify();
    });
  }

  // Where the images go. A fresh install has no such folder, so it is made first:
  // showing a missing one (Explorer, Finder) lands somewhere else and looks broken.
  reveal(cx) {
    const dir = this.folder();
    const win = dir.replaceAll("/", "\\");
    const [command, args] = window()?.platform === "windows"
      ? ["cmd", ["/c", `if not exist "${win}" mkdir "${win}" & explorer "${win}"`]]
      : ["sh", ["-c", 'mkdir -p "$1" && exec "$2" "$1"', "sh", dir, window()?.platform === "macos" ? "open" : "xdg-open"]];
    cx.spawn(async (cx) => {
      try {
        const r = await exec(command, args);
        this.error = r && r.code ? (r.stderr ?? r.stdout ?? `exit ${r.code}`).trim().split("\n")[0] : null;
      } catch (e) {
        this.error = String(e?.message ?? e);
      }
      cx.notify();
    });
  }

  setImage(cx, area, file) {
    this.save(cx, (tree) => {
      const node = find(tree, area.id);
      if (!node) return;
      if (file) node.background = { image: `backgrounds/${file}`, fit: "cover" };
      else if (area.none) node.background = area.none;
      else delete node.background;
      // The pane cards cover the image unless they let it through.
      if (area.id === "main" && node.content?.pane) node.content.pane.background = file ? "#00000000" : "background";
      // The sidebar and the tab bar paint chrome over the image: on an opaque chrome
      // the choice shows nothing at all, so putting an image there thins the panel.
      if (file && area.id !== "main" && alphaOf(tree.colors?.chrome) === 1)
        tree.colors = { ...(tree.colors ?? {}), chrome: theme().chrome.slice(0, 7) + "b3" };
    });
  }

  setTerminal(cx, v) {
    this.save(cx, (tree) => {
      if (v >= 1) delete tree.terminal_opacity;
      else tree.terminal_opacity = v;
    });
  }

  setPanel(cx, v) {
    const base = theme().chrome.slice(0, 7);
    this.save(cx, (tree) => {
      tree.colors = { ...(tree.colors ?? {}) };
      if (v >= 1) delete tree.colors.chrome;
      else tree.colors.chrome = base + Math.round(v * 255).toString(16).padStart(2, "0");
      if (!Object.keys(tree.colors).length) delete tree.colors;
    });
  }

  tile(id, selected, content, onClick) {
    const t = theme();
    return div().id(id).w(96).h(54).flex_none().rounded(6).overflow_hidden().border(2).border_color(selected ? t.accent : t.border)
      .cursor_pointer().hover((s) => s.border_color(selected ? t.accent : t.input)).on_click(onClick).child(content);
  }

  choice(id, label, selected, onClick) {
    const t = theme();
    return div().id(id).h(26).px(10).flex().items_center().rounded(6).cursor_pointer().border(1)
      .border_color(selected ? t.accent : t.border).text_color(selected ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover)).on_click(onClick).child(label);
  }

  render() {
    const t = theme();
    const tree = this.tree;
    const heading = (s) => div().text_size(11.5).font_medium().text_color(t.dim).child(s);
    const areas = AREAS.map((area) => {
      const current = imageOf(find(tree, area.id));
      return v_flex().gap(6)
        .child(heading(area.label))
        .child(h_flex().gap(8).flex_wrap()
          .child(this.tile(`${area.id}-none`, !current, div().size_full().bg(t.chrome).flex().items_center().justify_center().text_color(t.muted).child("None"), (_e, cx) => this.setImage(cx, area, null)))
          .children(this.files.map((f) => this.tile(`${area.id}-${f}`, current === `backgrounds/${f}`, image(`backgrounds/${f}`).size_full(), (_e, cx) => this.setImage(cx, area, f)))));
    });
    const term = tree?.terminal_opacity ?? 1;
    const chromeHex = tree?.colors?.chrome;
    const panel = alphaOf(chromeHex);
    const near = (list, v) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    return v_flex().w_full().p(20).gap(16).text_size(13).text_color(t.foreground)
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(15).font_semibold().child("Background"))
        .child(h_flex().gap(8)
          .child(this.choice("open-folder", "Open folder", false, (_e, cx) => this.reveal(cx)))
          .child(this.choice("reload", "Reload", false, (_e, cx) => cx.spawn(async (cx) => { await this.load(); cx.notify(); })))))
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.blocked).child(this.error)))
      .when(Boolean(tree), (el) => el
        .children(areas)
        .child(v_flex().gap(6).child(heading("Terminal background"))
          .child(h_flex().gap(6).children(TERMINAL.map((v) => this.choice(`term-${v}`, pct(v), near(TERMINAL, term) === v, (_e, cx) => this.setTerminal(cx, v))))))
        .child(v_flex().gap(6).child(heading("Panel background"))
          .child(h_flex().gap(6).children(PANEL.map((v) => this.choice(`panel-${v}`, pct(v), near(PANEL, panel) === v, (_e, cx) => this.setPanel(cx, v)))))))
      .child(h_flex().justify_end().child(this.choice("close", "Close", false, () => closeOverlay(props().overlay))));
  }
}
