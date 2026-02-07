import express from "express";
import ytdlp from "yt-dlp-exec";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs-extra";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

app.post("/process-video", async (req, res) => {
  const { url } = req.body;

  const base = "./work";
  await fs.ensureDir(base);

  const videoPath = `${base}/original.mp4`;
  const audioPath = `${base}/audio.mp3`;

  try {
    await ytdlp(url, { output: videoPath, format: "mp4" });

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec("mp3")
        .save(audioPath)
        .on("end", resolve)
        .on("error", reject);
    });

    const transcript = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1"
    });

    const gpt = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Select the best 5 viral moments and return timestamps as JSON [{start: number, end: number}]"
        },
        {
          role: "user",
          content: transcript.text
        }
      ]
    });

    const timestamps = JSON.parse(gpt.choices[0].message.content);

    const clips = [];

    for (let i = 0; i < timestamps.length; i++) {
      const clipPath = `${base}/clip_${i}.mp4`;

      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .setStartTime(timestamps[i].start)
          .setDuration(timestamps[i].end - timestamps[i].start)
          .save(clipPath)
          .on("end", resolve)
          .on("error", reject);
      });

      clips.push(clipPath);
    }

    res.json({ clips });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao processar vídeo" });
  }
});

app.listen(3000, () => console.log("Servidor rodando"));
