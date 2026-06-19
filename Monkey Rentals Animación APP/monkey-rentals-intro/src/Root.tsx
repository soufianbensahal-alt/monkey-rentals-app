import "./index.css";
import { Composition } from "remotion";
import { MonkeyRentalsIntro } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MonkeyRentals"
        component={MonkeyRentalsIntro}
        durationInFrames={60}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
