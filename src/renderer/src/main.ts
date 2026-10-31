import { App } from "./app";
import { TitleScreen } from "./screens/menus";

const canvas = document.getElementById("screen") as HTMLCanvasElement;
const app = new App(canvas);
app.reset(new TitleScreen(app));
