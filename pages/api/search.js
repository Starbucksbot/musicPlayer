export default async function handler(req, res) {
    const { q } = req.query;
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${q}&key=${process.env.YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    res.status(200).json(data.items || []);
  }