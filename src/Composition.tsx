import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Series,
  Audio,
  Img,
  staticFile,
} from "remotion";
import { z } from "zod";
// import {Rocket, AlertTriangle, CheckCircle2, ArrowRight} from 'lucide-react';

export const sceneSchema = z.object({
  text: z.string(),
  style: z.enum(["title", "statement", "cta"]),
  durationInFrames: z.number(),
  audioFile: z.string().optional(),
  imageFile: z.string().optional(),
});

export const myCompSchema = z.object({
  scenes: z.array(sceneSchema),
  settings: z.any().optional(),
});

const SCENE_COLORS: Record<string, { bg: string; text: string }> = {
  title: { bg: "#1f2318", text: "#e8a33d" },
  statement: { bg: "#f6f1e4", text: "#1f2318" },
  cta: { bg: "#b5482f", text: "#fffdf7" },
};

const Scene: React.FC<{
  text: string;
  style: "title" | "statement" | "cta";
  index: number;
  imageFile?: string;
  brandColor?: string;
}> = ({ text, style, index, imageFile, brandColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = { ...SCENE_COLORS[style] };
  if (brandColor && (style === "title" || style === "cta")) {
    colors.bg = brandColor;
    colors.text = "#ffffff";
  }

  let textOpacity = 1;
  let textTransform = "";
  if (style === "title") {
    const scale = spring({
      frame,
      fps,
      config: { damping: 12, stiffness: 100 },
    });
    textOpacity = interpolate(frame, [0, 12], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    textTransform = `scale(${scale})`;
  } else if (style === "statement") {
    const slideX = interpolate(
      frame,
      [0, 15],
      [index % 2 === 0 ? -60 : 60, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    textOpacity = interpolate(frame, [0, 15], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    textTransform = `translateX(${slideX}px)`;
  } else if (style === "cta") {
    const pulse = 1 + Math.sin(frame / 8) * 0.03;
    textOpacity = interpolate(frame, [0, 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    textTransform = `scale(${pulse})`;
  }

  const imageScale = interpolate(frame, [0, 90], [1, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fontSize = style === "title" ? 64 : style === "cta" ? 56 : 46;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {imageFile && (
        <AbsoluteFill>
          <Img
            src={staticFile(imageFile)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${imageScale})`,
              scale: 0.951,
            }}
          />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.75) 100%)",
            }}
          />
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "0 60px 140px 60px",
        }}
      >
        <div
          style={{
            transform: textTransform,
            opacity: textOpacity,
            fontSize,
            fontWeight: "bold",
            color: imageFile ? "#000000" : colors.text,
            fontFamily: "Georgia, serif",
            textAlign: "center",
            lineHeight: 1.3,
            textShadow: imageFile ? "0 2px 15px rgba(255,255,255,0.8), 0 0 5px rgba(255,255,255,0.5)" : "none",
          }}
        >
          {text}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const MyComposition = ({ scenes, settings }: z.infer<typeof myCompSchema>) => {
  const brandColor = settings?.brandColor || null;
  return (
    <AbsoluteFill>
      {settings?.music !== "none" && (
        <Audio src={staticFile("audio/background.wav")} volume={0.08} loop />
      )}
      <Series>
        {scenes.map((scene, i) => (
          <Series.Sequence key={i} durationInFrames={scene.durationInFrames}>
            <Scene text={scene.text} style={scene.style} index={i} brandColor={brandColor} />
            {scene.audioFile && <Audio src={staticFile(scene.audioFile)} />}
            <Scene
              text={scene.text}
              style={scene.style}
              index={i}
              imageFile={scene.imageFile}
              brandColor={brandColor}
            />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
