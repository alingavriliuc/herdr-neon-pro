import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

export default class WorkspaceChrome extends View {
  // A quiet square icon button, Apple-sidebar style.
  button(id, icon, action, tip) {
    const t = theme();
    return div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(8).text_color(t.dim)
      .hover(s => s.bg("#ffffff0f").text_color(t.foreground))
      .when(Boolean(tip), el => el.tooltip(tip))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action)
      .child(svg(`mods/neon-pro-chrome/${icon}.svg`).size(15));
  }

  footer(t, collapsed) {
    const update = Boolean(updates().app.ready);
    const settings = h_flex().id("settings").h(32).px(10).gap(10).items_center().rounded(9).cursor_pointer()
      .when(!collapsed, el => el.flex_1())
      .text_color(t.muted).hover(s => s.bg("#ffffff0a").text_color(t.foreground))
      .on_click(() => run("app.settings"))
      .child(svg("mods/neon-pro-chrome/settings.svg").size(15).flex_none())
      .when(!collapsed, el => el.child(div().flex_1().child("Settings")))
      .when(update, el => el.child(h_flex().flex_none().px(7).h(18).rounded(9).bg(t.accent + "24").text_size(10.5).font_medium().text_color(t.accent)
        .child(collapsed ? "•" : "Update")));
    const add = this.button("machine", "server", () => run("mod.open", { name: "machine-add" }), "Add a machine");
    return div().size_full().bg(t.chrome).border_t(1).border_color("#ffffff0a").px(10).py(10).text_size(13)
      .child(collapsed
        ? v_flex().gap(4).items_center().child(settings).child(add)
        : h_flex().gap(4).items_center().child(settings).child(add));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) return this.footer(t, collapsed);
    const mac = window()?.platform === "macos" && !window()?.fullscreen;
    const top = h_flex().h(46).flex_none().pl(collapsed ? 6 : mac ? 82 : 16).pr(10).gap(4).items_center()
      .when(!collapsed, el => el.child(h_flex().flex_1().min_w(0).gap(8).items_center()
        .child(image("frame/welcome/herdr.png").size(18).rounded(5))
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Herdr"))))
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", "sidebar", toggleSidebar, "Toggle sidebar")));
    const search = h_flex().id("search").mx(10).h(30).px(10).gap(8).items_center().rounded(9).cursor_pointer()
      .bg("#ffffff08").border(1).border_color("#ffffff0f").text_size(12.5).text_color(t.dim)
      .hover(s => s.bg("#ffffff0d").border_color("#ffffff1a").text_color(t.muted))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("mod.open", { name: "picker" }))
      .child(svg("mods/neon-pro-chrome/search.svg").size(13).flex_none())
      .child(div().flex_1().child("Search"))
      .child(div().flex_none().px(5).h(18).flex().items_center().rounded(5).bg("#ffffff0a").text_size(10.5).text_color(t.dim).child("⌘P"));
    return v_flex().size_full().bg(t.chrome).text_size(13)
      .child(top)
      .when(!collapsed, el => el.child(search));
  }
}
