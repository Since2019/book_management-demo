using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;
using System.Xml.Linq;

namespace ClipboardShelf {
    public static class ImageReader {
        static readonly string[] ImageFormats = { "PNG", "image/png", "PNG+Office Art" };
        public static Entry FromImage(Image image) {
            if ((long)image.Width * image.Height > 24000000) throw new InvalidDataException("图片过大（最多 2400 万像素）");
            using (var stream = new MemoryStream()) {
                image.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
                if (stream.Length > History.MaxItem) throw new InvalidDataException("图片超过 8 MB");
                return Entry.FromPng(stream.ToArray());
            }
        }
        static Entry FromStream(Stream stream) {
            long position = stream.CanSeek ? stream.Position : 0;
            try {
                if (stream.CanSeek) stream.Position = 0;
                using (var image = Image.FromStream(stream)) return FromImage(image);
            } finally { if (stream.CanSeek) stream.Position = position; }
        }
        public static List<Entry> Read(IDataObject data, out string warning) {
            var result = new List<Entry>();
            warning = null;
            if (data == null) return result;
            foreach (string format in ImageFormats) {
                if (!data.GetDataPresent(format, false)) continue;
                try {
                    object value = data.GetData(format, false);
                    var stream = value as Stream;
                    if (stream != null) result.Add(FromStream(stream));
                    else if (value is byte[]) using (var bytes = new MemoryStream((byte[])value)) result.Add(FromStream(bytes));
                    else if (value is Image) result.Add(FromImage((Image)value));
                    if (result.Count > 0) return result;
                } catch (ExternalException) { throw; }
                catch (Exception) { warning = "部分图片格式无法读取"; }
            }
            if (data.GetDataPresent(DataFormats.Bitmap, true)) {
                try {
                    var image = data.GetData(DataFormats.Bitmap, true) as Image;
                    if (image != null) { result.Add(FromImage(image)); warning = null; return result; }
                } catch (ExternalException) { throw; }
                catch (Exception) { warning = "位图无法读取或超过大小限制"; }
            }
            if (data.GetDataPresent(DataFormats.FileDrop, true)) {
                var files = data.GetData(DataFormats.FileDrop, true) as string[];
                if (files != null) foreach (string path in files.Take(60)) {
                    string ext = Path.GetExtension(path).ToLowerInvariant();
                    if (!new[] { ".png", ".jpg", ".jpeg", ".jfif", ".bmp", ".gif", ".tif", ".tiff", ".ico" }.Contains(ext)) continue;
                    try {
                        if (new FileInfo(path).Length > 32 * 1024 * 1024) { warning = "部分图片文件过大，已跳过"; continue; }
                        using (var file = File.OpenRead(path)) result.Add(FromStream(file));
                    } catch (Exception) { warning = "部分图片文件无法读取或超过大小限制"; }
                    if (result.Sum(x => x.Size) >= History.MaxTotal) break;
                }
                if (result.Count == 0 && warning == null) warning = "未发现可读取的图片文件（支持 PNG、JPG、BMP、GIF、TIFF）";
            }
            if (result.Count == 0 && warning == null && data.GetDataPresent(DataFormats.UnicodeText, true)) {
                string value = data.GetData(DataFormats.UnicodeText, true) as string;
                if (!string.IsNullOrEmpty(value)) result.Add(Entry.FromText(value));
            }
            return result;
        }
    }

    public sealed class Entry : IDisposable {
        public string Text;
        public byte[] Png;
        public Image Preview;
        public string Key;
        public long Size { get { return Png == null ? Encoding.UTF8.GetByteCount(Text) : Png.Length; } }
        public static Entry FromText(string value) {
            return new Entry { Text = value, Key = Hash(Encoding.UTF8.GetBytes(value), "T") };
        }
        public static Entry FromPng(byte[] bytes) {
            using (var stream = new MemoryStream(bytes))
            using (var original = Image.FromStream(stream)) {
                return new Entry { Png = bytes, Preview = new Bitmap(original), Key = Hash(bytes, "I") };
            }
        }
        static string Hash(byte[] value, string prefix) {
            using (var hash = SHA256.Create()) return prefix + Convert.ToBase64String(hash.ComputeHash(value));
        }
        public void Dispose() { if (Preview != null) Preview.Dispose(); }
    }

    public sealed class History : IDisposable {
        public readonly List<Entry> Items = new List<Entry>();
        public const long MaxItem = 8 * 1024 * 1024;
        public const long MaxTotal = 48 * 1024 * 1024;
        public readonly string FilePath;
        public History(string path) { FilePath = path; }
        public bool Add(Entry item) {
            if (item.Size > MaxItem) { item.Dispose(); return false; }
            var old = Items.Find(x => x.Key == item.Key);
            if (old != null) { Items.Remove(old); old.Dispose(); }
            Items.Insert(0, item);
            while (Items.Count > 60 || Items.Sum(x => x.Size) > MaxTotal) Remove(Items[Items.Count - 1]);
            return true;
        }
        public void Remove(Entry item) { Items.Remove(item); item.Dispose(); }
        public void Clear() { foreach (var item in Items) item.Dispose(); Items.Clear(); }
        public void Save() {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
            var root = new XElement("history", Items.Select(x => new XElement(x.Png == null ? "text" : "image",
                Convert.ToBase64String(x.Png ?? Encoding.UTF8.GetBytes(x.Text)))));
            string temp = FilePath + ".tmp";
            new XDocument(root).Save(temp);
            if (File.Exists(FilePath)) File.Replace(temp, FilePath, null);
            else File.Move(temp, FilePath);
        }
        public void Load() {
            if (!File.Exists(FilePath)) return;
            if (new FileInfo(FilePath).Length > MaxTotal * 2) throw new IOException("历史文件过大");
            var root = XDocument.Load(FilePath).Root;
            foreach (var node in root.Elements().Reverse()) {
                var bytes = Convert.FromBase64String(node.Value);
                if (bytes.Length > MaxItem) continue;
                Add(node.Name == "image" ? Entry.FromPng(bytes) : Entry.FromText(Encoding.UTF8.GetString(bytes)));
            }
        }
        public void Dispose() { Clear(); }
    }

    public sealed class Shelf : Form {
        [DllImport("user32.dll")] static extern bool AddClipboardFormatListener(IntPtr window);
        [DllImport("user32.dll")] static extern bool RemoveClipboardFormatListener(IntPtr window);
        [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
        [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
        [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr window, int id);
        const int ClipboardUpdate = 0x031D;
        readonly History history;
        readonly ListBox list = new ListBox();
        readonly Label status = new Label();
        readonly Label count = new Label();
        readonly NotifyIcon tray = new NotifyIcon();
        readonly Timer retry = new Timer { Interval = 140 };
        readonly Timer save = new Timer { Interval = 700 };
        readonly Button pause;
        bool paused, exiting, listening, hotkey;
        int attempts;
        uint ownSequence;
        string filter = "全部";
        Entry selected;
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams {
            get { var p = base.CreateParams; p.ExStyle |= 0x08000000; return p; }
        }
        protected override void WndProc(ref Message m) {
            if (m.Msg == 0x0021) { m.Result = new IntPtr(3); return; }
            if (m.Msg == ClipboardUpdate && !paused && GetClipboardSequenceNumber() != ownSequence) {
                attempts = 0; retry.Start();
            }
            if (m.Msg == 0x0312) Toggle();
            base.WndProc(ref m);
        }
        public Shelf(History data) {
            history = data;
            Text = "随手贴 · 剪贴板";
            Font = new Font("Microsoft YaHei UI", 9F);
            BackColor = Color.FromArgb(247, 248, 252);
            ClientSize = new Size(358, 540);
            MinimumSize = new Size(340, 350);
            TopMost = true; ShowInTaskbar = true;
            StartPosition = FormStartPosition.Manual;
            var screen = Screen.PrimaryScreen.WorkingArea;
            Location = new Point(screen.Right - Width - 24, screen.Top + 90);
            var title = new Label { Text = "随手贴", Font = new Font(Font.FontFamily, 18, FontStyle.Bold),
                Location = new Point(16, 14), AutoSize = true };
            Controls.Add(title);
            Controls.Add(new Label { Text = "点选一条，然后在原窗口按 Ctrl+V", AutoSize = true, Location = new Point(18, 53), ForeColor = Color.DimGray });
            var filters = new FlowLayoutPanel { Location = new Point(14, 82), Size = new Size(330, 34) };
            foreach (string name in new[] { "全部", "文字", "图片" }) {
                string value = name;
                var b = MakeButton(name, 67);
                b.Click += delegate { filter = value; RefreshItems(); };
                filters.Controls.Add(b);
            }
            pause = MakeButton("暂停", 67);
            pause.Click += delegate { paused = !paused; pause.Text = paused ? "继续" : "暂停"; status.Text = paused ? "已暂停收集新内容" : "正在记录复制的文字和图片"; };
            filters.Controls.Add(pause); Controls.Add(filters);
            count.SetBounds(18, 121, 320, 22); Controls.Add(count);
            list.SetBounds(14, 149, 330, 294);
            list.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            list.DrawMode = DrawMode.OwnerDrawFixed; list.ItemHeight = 88; list.BorderStyle = BorderStyle.None;
            list.BackColor = BackColor; list.IntegralHeight = false;
            list.DrawItem += DrawItem;
            list.MouseDown += delegate(object sender, MouseEventArgs e) {
                int index = list.IndexFromPoint(e.Location);
                if (index >= 0 && e.Button == MouseButtons.Left) Choose((Entry)list.Items[index]);
            };
            Controls.Add(list);
            var actions = new FlowLayoutPanel { Location = new Point(14, 452), Size = new Size(330, 36), Anchor = AnchorStyles.Bottom | AnchorStyles.Left };
            var delete = MakeButton("删除选中", 100);
            delete.Click += delegate { if (selected == null) return; history.Remove(selected); selected = null; Changed(); status.Text = "已从历史删除；系统剪贴板不受影响"; };
            var clear = MakeButton("清空历史", 100);
            clear.Click += delegate { history.Clear(); selected = null; Changed(); status.Text = "历史已清空；系统剪贴板不受影响"; };
            var hide = MakeButton("收起", 100); hide.Click += delegate { Hide(); };
            actions.Controls.AddRange(new Control[] { delete, clear, hide }); Controls.Add(actions);
            status.SetBounds(18, 496, 324, 36); status.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            status.ForeColor = Color.FromArgb(75, 83, 108); status.Text = "正在记录复制的文字和图片"; Controls.Add(status);
            tray.Icon = SystemIcons.Application; tray.Text = "随手贴 · 点击打开";
            var menu = new ContextMenuStrip();
            menu.Items.Add("显示 / 收起", null, delegate { Toggle(); });
            menu.Items.Add("退出", null, delegate { exiting = true; Close(); });
            tray.ContextMenuStrip = menu; tray.MouseClick += delegate(object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) Toggle(); };
            tray.Visible = true;
            retry.Tick += CaptureClipboard;
            save.Tick += delegate { save.Stop(); SaveHistory(); };
            FormClosing += delegate(object s, FormClosingEventArgs e) { if (!exiting && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); } };
            RefreshItems();
        }
        protected override void OnHandleCreated(EventArgs e) {
            base.OnHandleCreated(e);
            listening = AddClipboardFormatListener(Handle);
            hotkey = RegisterHotKey(Handle, 1, 0x4000 | 0x0002 | 0x0004, (uint)Keys.V);
            if (!listening) status.Text = "无法监听剪贴板，请退出后重新启动";
            else if (!hotkey) status.Text = "快捷键被占用，可通过托盘图标打开";
        }
        protected override void OnHandleDestroyed(EventArgs e) {
            if (listening) RemoveClipboardFormatListener(Handle);
            if (hotkey) UnregisterHotKey(Handle, 1);
            base.OnHandleDestroyed(e);
        }
        Button MakeButton(string text, int width) {
            return new Button { Text = text, Width = width, Height = 29, FlatStyle = FlatStyle.Flat,
                BackColor = Color.White, ForeColor = Color.FromArgb(52, 62, 87), Margin = new Padding(3), TabStop = false };
        }
        void Toggle() { if (Visible) Hide(); else Show(); }
        void CaptureClipboard(object sender, EventArgs args) {
            retry.Stop();
            if (paused || GetClipboardSequenceNumber() == ownSequence) return;
            try {
                uint before = GetClipboardSequenceNumber();
                string warning;
                var items = ImageReader.Read(Clipboard.GetDataObject(), out warning);
                if (before != GetClipboardSequenceNumber()) { foreach (var item in items) item.Dispose(); if (++attempts < 8) retry.Start(); return; }
                if (items.Count == 0) {
                    if (++attempts < 8) retry.Start();
                    else status.Text = warning ?? "当前内容没有可读取的文字或图片";
                    return;
                }
                foreach (var item in items) if (!history.Add(item)) warning = "部分内容超过 8 MB，已跳过";
                if (selected != null && !history.Items.Contains(selected)) selected = null;
                Changed(); status.Text = warning ?? "已记录 · 点击即可选择要粘贴的内容";
            } catch (ExternalException) { if (++attempts < 8) retry.Start(); else status.Text = "剪贴板正忙，这次内容未能记录"; }
            catch (Exception) { status.Text = "这次剪贴板格式无法读取，已跳过"; }
        }
        void Choose(Entry item) {
            try {
                if (item.Png == null) Clipboard.SetText(item.Text);
                else {
                    using (var png = new MemoryStream(item.Png)) {
                        var data = new DataObject();
                        data.SetData(DataFormats.Bitmap, true, item.Preview);
                        data.SetData("PNG", false, png);
                        Clipboard.SetDataObject(data, true, 5, 80);
                    }
                }
                ownSequence = GetClipboardSequenceNumber(); selected = item;
                list.Invalidate(); status.Text = "已选好 · 直接在原窗口按 Ctrl+V";
            } catch (ExternalException) { status.Text = "剪贴板正忙，请再点一次"; }
        }
        void Changed() { RefreshItems(); save.Stop(); save.Start(); }
        void SaveHistory() {
            try { history.Save(); }
            catch (Exception) { status.Text = "本地保存失败，当前记录仍可使用"; }
        }
        void RefreshItems() {
            list.BeginUpdate(); list.Items.Clear();
            foreach (var item in history.Items) if (filter == "全部" || (filter == "文字" && item.Png == null) || (filter == "图片" && item.Png != null)) list.Items.Add(item);
            list.EndUpdate(); count.Text = filter + " · " + list.Items.Count + " 条 / 最多 60 条";
            if (list.Items.Count == 0) count.Text += " · 复制内容后显示在这里";
        }
        void DrawItem(object sender, DrawItemEventArgs e) {
            if (e.Index < 0) return;
            var item = (Entry)list.Items[e.Index];
            var rect = new Rectangle(e.Bounds.X + 2, e.Bounds.Y + 3, e.Bounds.Width - 5, e.Bounds.Height - 7);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var brush = new SolidBrush(item == selected ? Color.FromArgb(230, 237, 255) : Color.White)) e.Graphics.FillRectangle(brush, rect);
            int x = rect.X + 12;
            if (item.Preview != null) {
                float scale = Math.Min(66F / item.Preview.Width, 58F / item.Preview.Height);
                int w = Math.Max(1, (int)(item.Preview.Width * scale)), h = Math.Max(1, (int)(item.Preview.Height * scale));
                e.Graphics.DrawImage(item.Preview, new Rectangle(x, rect.Y + 12, w, h)); x += 78;
            }
            string heading = (item.Png == null ? "文字" : "图片 · " + item.Preview.Width + " × " + item.Preview.Height) + (item == selected ? "   ✓ 待粘贴" : "");
            TextRenderer.DrawText(e.Graphics, heading, Font, new Rectangle(x, rect.Y + 8, rect.Right - x - 8, 22), Color.FromArgb(74, 94, 160), TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
            string body = item.Text ?? "点击选中这张图片";
            if (body.Length > 250) body = body.Substring(0, 250) + "…";
            TextRenderer.DrawText(e.Graphics, body.Replace("\r\n", "  ").Replace("\n", "  ").Replace("\t", "  "), Font,
                new Rectangle(x, rect.Y + 33, rect.Right - x - 10, 40), Color.FromArgb(40, 45, 57), TextFormatFlags.WordBreak | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
        }
        protected override void Dispose(bool disposing) {
            if (disposing) { retry.Dispose(); save.Dispose(); SaveHistory(); tray.Visible = false; tray.Dispose(); history.Dispose(); }
            base.Dispose(disposing);
        }
    }

    public static class Program {
        [STAThread] public static void Main() { Run(); }
        [STAThread] public static void Run() {
            bool created;
            using (var mutex = new System.Threading.Mutex(true, "Local\\ClipboardShelf.Desktop", out created)) {
                if (!created) { MessageBox.Show("随手贴已经在运行，可点击托盘图标或按 Ctrl+Shift+V 打开。", "随手贴"); return; }
                Application.EnableVisualStyles();
                var history = new History(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ClipboardShelf", "history.xml"));
                try { history.Load(); } catch (Exception) { MessageBox.Show("历史文件无法读取，本次将使用空列表。", "随手贴"); }
                using (var form = new Shelf(history)) Application.Run(form);
            }
        }
        public static void SelfTest(string directory) {
            ImageReaderSelfTest(directory);
            string path = Path.Combine(directory, "selftest-" + Guid.NewGuid().ToString("N") + ".xml");
            try {
                using (var h = new History(path)) {
                    h.Add(Entry.FromText("中文\r\nemoji 😀 <>&\u0001"));
                    h.Add(Entry.FromText("中文\r\nemoji 😀 <>&\u0001"));
                    if (h.Items.Count != 1) throw new Exception("Deduplication failed");
                    using (var bitmap = new Bitmap(20, 10)) using (var stream = new MemoryStream()) {
                        bitmap.SetPixel(2, 2, Color.Red); bitmap.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
                        h.Add(Entry.FromPng(stream.ToArray()));
                    }
                    h.Save(); h.Save();
                    using (var loaded = new History(path)) {
                        loaded.Load();
                        if (loaded.Items.Count != 2 || loaded.Items[0].Preview.Width != 20 || loaded.Items[1].Text != h.Items[1].Text) throw new Exception("Persistence failed");
                        if (((Bitmap)loaded.Items[0].Preview).GetPixel(2, 2).ToArgb() != Color.Red.ToArgb()) throw new Exception("Image roundtrip failed");
                    }
                    for (int i = 0; i < 75; i++) h.Add(Entry.FromText(i.ToString()));
                    if (h.Items.Count != 60 || h.Items[0].Text != "74") throw new Exception("Retention failed");
                    if (h.Add(Entry.FromText(new string('x', (int)History.MaxItem + 1)))) throw new Exception("Size limit failed");
                    h.Clear(); h.Save();
                    using (var empty = new History(path)) { empty.Load(); if (empty.Items.Count != 0) throw new Exception("Clear failed"); }
                }
                Console.WriteLine("PASS: Unicode text, deduplication, PNG pixels, persistence replacement, retention, size limit, clear.");
            } finally { if (File.Exists(path)) File.Delete(path); if (File.Exists(path + ".tmp")) File.Delete(path + ".tmp"); }
        }
        static void CheckImageData(IDataObject data, int expected, string label) {
            string warning;
            var entries = ImageReader.Read(data, out warning);
            try {
                if (entries.Count != expected || entries.Any(x => x.Preview == null || x.Preview.Width != 20 || x.Preview.Height != 10)) throw new Exception(label + " failed");
                if (entries.Any(x => ((Bitmap)x.Preview).GetPixel(2, 2).ToArgb() != Color.Red.ToArgb())) throw new Exception(label + " pixels failed");
            } finally { foreach (var entry in entries) entry.Dispose(); }
        }
        static void ImageReaderSelfTest(string directory) {
            string fixture = Path.Combine(directory, "image-test-" + Guid.NewGuid().ToString("N") + ".png");
            try {
                using (var bitmap = new Bitmap(20, 10)) using (var stream = new MemoryStream()) {
                    bitmap.SetPixel(2, 2, Color.Red);
                    bitmap.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
                    File.WriteAllBytes(fixture, stream.ToArray());
                    var png = new DataObject(); png.SetData("PNG", false, stream);
                    CheckImageData(png, 1, "PNG-only clipboard stream at EOF");
                    if (stream.Position != stream.Length) throw new Exception("Stream position not preserved");
                    var bytes = new DataObject(); bytes.SetData("image/png", false, stream.ToArray());
                    CheckImageData(bytes, 1, "image/png byte array");
                    var standard = new DataObject(); standard.SetData(DataFormats.Bitmap, true, bitmap);
                    CheckImageData(standard, 1, "Standard bitmap");
                    standard.SetData("PNG", false, new byte[] { 1, 2, 3 });
                    CheckImageData(standard, 1, "Malformed PNG bitmap fallback");
                    var files = new DataObject(); files.SetData(DataFormats.FileDrop, true, new[] { fixture, fixture, fixture + ".txt" });
                    CheckImageData(files, 2, "Explorer multiple image files");
                    var text = new DataObject(); text.SetText("纯文本仍然可用");
                    string warning; var values = ImageReader.Read(text, out warning);
                    try { if (values.Count != 1 || values[0].Text != "纯文本仍然可用") throw new Exception("Text regression"); }
                    finally { foreach (var value in values) value.Dispose(); }
                }
                Console.WriteLine("PASS: PNG stream, image/png bytes, bitmap, malformed format fallback, Explorer image files, text fallback.");
            } finally { if (File.Exists(fixture)) File.Delete(fixture); }
        }
    }
}
