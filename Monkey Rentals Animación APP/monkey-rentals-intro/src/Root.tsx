import "./index.css";
import { Composition, Folder } from "remotion";
import { MonkeyPC } from "./pc/MonkeyPC";
import { MonkeyMovil } from "./movil/MonkeyMovil";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="PC"><Composition id="Monkey-PC" component={MonkeyPC} durationInFrames={150} fps={60} width={1920} height={1080}/></Folder>
      <Folder name="Movil"><Composition id="Monkey-Movil" component={MonkeyMovil} durationInFrames={150} fps={60} width={1080} height={1920}/></Folder>
    </>
  );
};
