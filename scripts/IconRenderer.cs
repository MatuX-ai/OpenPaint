using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public class IconSize
{
    public string File;
    public int Size;
    public IconSize(string f, int s) { File = f; Size = s; }
}

public class IconEntry
{
    public int Size;
    public byte[] Data;
    public IconEntry(int s, byte[] d) { Size = s; Data = d; }
}

public class IconTypeEntry
{
    public string Type;
    public int Size;
    public IconTypeEntry(string t, int s) { Type = t; Size = s; }
}

public static class IconRenderer
{
    private const float Sx = 64f;

    private static Bitmap DrawIcon(int size)
    {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.Clear(Color.Transparent);

            float s = size / Sx;

            using (var path = RoundedRect(2f * s, 2f * s, 60f * s, 60f * s, 14f * s))
            using (var brush = new LinearGradientBrush(
                new RectangleF(0, 0, size, size),
                Color.FromArgb(255, 108, 92, 231),
                Color.FromArgb(255, 162, 155, 254),
                LinearGradientMode.ForwardDiagonal))
            {
                g.FillPath(brush, path);
            }

            var nib = new PointF[] {
                new PointF(20f * s, 44f * s),
                new PointF(20f * s, 36f * s),
                new PointF(36f * s, 20f * s),
                new PointF(44f * s, 28f * s),
                new PointF(28f * s, 44f * s)
            };
            using (var white = new SolidBrush(Color.White))
                g.FillPolygon(white, nib);

            var hl = new PointF[] {
                new PointF(22f * s, 42f * s),
                new PointF(34f * s, 30f * s),
                new PointF(36f * s, 32f * s),
                new PointF(24f * s, 44f * s)
            };
            using (var hlBrush = new SolidBrush(Color.FromArgb(166, 214, 210, 255)))
                g.FillPolygon(hlBrush, hl);

            var state = g.Save();
            g.TranslateTransform(45f * s, 17f * s);
            g.RotateTransform(-45f);
            g.TranslateTransform(-45f * s, -17f * s);
            float hR = Math.Max(1f, 1.5f * s);
            using (var handle = RoundedRect(38f * s, 14f * s, 14f * s, 6f * s, hR))
            using (var hb = new SolidBrush(Color.FromArgb(255, 255, 245, 225)))
                g.FillPath(hb, handle);
            g.Restore(state);

            using (var gold = new SolidBrush(Color.FromArgb(255, 253, 203, 110)))
                g.FillEllipse(gold, 45.5f * s, 17.5f * s, 5f * s, 5f * s);
            using (var green = new SolidBrush(Color.FromArgb(255, 0, 184, 148)))
                g.FillEllipse(green, 12.2f * s, 46.2f * s, 3.6f * s, 3.6f * s);
        }
        return bmp;
    }

    private static GraphicsPath RoundedRect(float x, float y, float w, float h, float r)
    {
        var p = new GraphicsPath();
        float d = r * 2;
        p.AddArc(x, y, d, d, 180, 90);
        p.AddArc(x + w - d, y, d, d, 270, 90);
        p.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        p.AddArc(x, y + h - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    private static byte[] PngBytes(Bitmap bmp)
    {
        using (var ms = new MemoryStream())
        {
            bmp.Save(ms, ImageFormat.Png);
            return ms.ToArray();
        }
    }

    public static void Generate(string outDir)
    {
        Directory.CreateDirectory(outDir);

        var pngSpec = new List<IconSize>();
        pngSpec.Add(new IconSize("32x32.png", 32));
        pngSpec.Add(new IconSize("128x128.png", 128));
        pngSpec.Add(new IconSize("128x128@2x.png", 256));
        pngSpec.Add(new IconSize("icon.png", 512));
        pngSpec.Add(new IconSize("Square30x30Logo.png", 30));
        pngSpec.Add(new IconSize("Square44x44Logo.png", 44));
        pngSpec.Add(new IconSize("Square71x71Logo.png", 71));
        pngSpec.Add(new IconSize("Square89x89Logo.png", 89));
        pngSpec.Add(new IconSize("Square107x107Logo.png", 107));
        pngSpec.Add(new IconSize("Square142x142Logo.png", 142));
        pngSpec.Add(new IconSize("Square150x150Logo.png", 150));
        pngSpec.Add(new IconSize("Square284x284Logo.png", 284));
        pngSpec.Add(new IconSize("Square310x310Logo.png", 310));
        pngSpec.Add(new IconSize("StoreLogo.png", 50));
        foreach (var s in pngSpec)
        {
            using (var bmp = DrawIcon(s.Size))
                bmp.Save(Path.Combine(outDir, s.File), ImageFormat.Png);
        }

        int[] icoSizes = new int[] { 16, 24, 32, 48, 64, 128, 256 };
        var icoEntries = new List<IconEntry>();
        foreach (var sz in icoSizes)
        {
            using (var bmp = DrawIcon(sz))
                icoEntries.Add(new IconEntry(sz, PngBytes(bmp)));
        }
        WriteIco(Path.Combine(outDir, "icon.ico"), icoEntries);

        var icnsSpec = new List<IconTypeEntry>();
        icnsSpec.Add(new IconTypeEntry("ic07", 128));
        icnsSpec.Add(new IconTypeEntry("ic08", 256));
        icnsSpec.Add(new IconTypeEntry("ic09", 512));
        icnsSpec.Add(new IconTypeEntry("ic10", 1024));
        icnsSpec.Add(new IconTypeEntry("ic11", 32));
        icnsSpec.Add(new IconTypeEntry("ic12", 64));
        icnsSpec.Add(new IconTypeEntry("ic13", 256));
        icnsSpec.Add(new IconTypeEntry("ic14", 512));
        var chunks = new MemoryStream();
        foreach (var e in icnsSpec)
        {
            byte[] data;
            using (var bmp = DrawIcon(e.Size))
                data = PngBytes(bmp);
            var typeBytes = System.Text.Encoding.ASCII.GetBytes(e.Type);
            chunks.Write(typeBytes, 0, 4);
            uint len = (uint)(8 + data.Length);
            chunks.WriteByte((byte)(len >> 24));
            chunks.WriteByte((byte)(len >> 16));
            chunks.WriteByte((byte)(len >> 8));
            chunks.WriteByte((byte)len);
            chunks.Write(data, 0, data.Length);
        }
        var chunkBytes = chunks.ToArray();
        chunks.Dispose();
        using (var fs = File.Create(Path.Combine(outDir, "icon.icns")))
        {
            var magic = System.Text.Encoding.ASCII.GetBytes("icns");
            fs.Write(magic, 0, 4);
            uint total = (uint)(8 + chunkBytes.Length);
            fs.WriteByte((byte)(total >> 24));
            fs.WriteByte((byte)(total >> 16));
            fs.WriteByte((byte)(total >> 8));
            fs.WriteByte((byte)total);
            fs.Write(chunkBytes, 0, chunkBytes.Length);
        }
    }

    private static void WriteIco(string path, List<IconEntry> entries)
    {
        using (var fs = File.Create(path))
        using (var bw = new BinaryWriter(fs))
        {
            bw.Write((ushort)0);
            bw.Write((ushort)1);
            bw.Write((ushort)entries.Count);
            int offset = 6 + 16 * entries.Count;
            foreach (var e in entries)
            {
                int dim = e.Size >= 256 ? 0 : e.Size;
                bw.Write((byte)dim);
                bw.Write((byte)dim);
                bw.Write((byte)0);
                bw.Write((byte)0);
                bw.Write((ushort)1);
                bw.Write((ushort)32);
                bw.Write((uint)e.Data.Length);
                bw.Write((uint)offset);
                offset += e.Data.Length;
            }
            foreach (var e in entries)
                bw.Write(e.Data);
        }
    }
}