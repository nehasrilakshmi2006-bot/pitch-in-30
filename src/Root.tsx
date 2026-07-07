import "./index.css";
import { Composition, CalculateMetadataFunction } from "remotion";
import { z } from "zod";
import { MyComposition, myCompSchema } from "./Composition";
import scenesData from "./scenes.json";

const format = (scenesData as any).settings?.format || "9:16";
let compWidth = 1080;
let compHeight = 1920;
if (format === "16:9") {
  compWidth = 1920;
  compHeight = 1080;
} else if (format === "1:1") {
  compWidth = 1080;
  compHeight = 1080;
}

const calculateMetadata: CalculateMetadataFunction<z.infer<typeof myCompSchema>> = ({ props }) => {
  const totalDuration = props.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0);
  return {
    durationInFrames: totalDuration,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MyComp"
        component={MyComposition}
        durationInFrames={330}
        fps={30}
        width={compWidth}
        height={compHeight}
        schema={myCompSchema}
        defaultProps={scenesData as any}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};