// Pane header of the "neon-pro" layout: quiet, sentence-case, Apple-like.
// Dot · program · folder ……… branch · status capsule · controls on hover.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home } from "herdr";

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class NeonProPane extends View {
  init() { this.hovered = false; }

  button(t, id, icon, command, args) {
    return div().id(id).size(22).flex().items_center().justify_center().rounded(6).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); run(command, args); })
      .child(svg(`mods/neon-pro-pane/${icon}.svg`).size(12));
  }

  render() {
    const t = theme();
    const p = panes().find((x) => x.pane === props()?.pane);
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "Shell";
    const st = p.status;
    const pane = p.pane;
    const status = {
      working: ["Running", t.working],
      blocked: ["Needs you", t.blocked],
      done: ["Done", t.done],
    }[st];

    return h_flex().id(`npp-${pane}`).size_full().pl(14).pr(8).gap(10).items_center()
      .bg(t.surface + (p.focused ? "f2" : "b3"))
      .border_b(1).border_color("#ffffff0d")
      .text_size(12)
      .on_hover((h, cx) => { this.hovered = h; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .child(div().flex_none().size(7).rounded(4)
        .bg(p.focused ? t.accent : t.input)
        .when(p.focused, (e) => e.shadow_sm()))
      .child(div().flex_none().truncate().max_w(240).font_medium()
        .text_color(p.focused ? t.foreground : t.muted).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(Boolean(p.branch) && !this.hovered, (el) => el.child(
        div().flex_none().truncate().max_w(160).text_color(t.dim).child(p.branch)))
      .when(Boolean(status) && !this.hovered, (el) => el.child(
        h_flex().flex_none().gap(6).items_center().px(8).h(20).rounded(10)
          .bg(status[1] + "1a")
          .text_size(11).font_medium().text_color(status[1])
          .child(div().size(6).rounded(3).bg(status[1])
            .when(st !== "done", (e) => e.loop("opacity", { from: 0.35, to: 1, period: st === "blocked" ? 900 : 1400 })))
          .child(status[0])))
      .when(this.hovered, (el) => el.child(h_flex().flex_none().gap(2)
        .child(this.button(t, `npp-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `npp-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `npp-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `npp-x-${pane}`, "close", "pane.close", { pane }))));
  }
}
