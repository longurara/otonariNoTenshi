const fs = require("node:fs");
const path = require("node:path");

// Curated cast from the Vietnamese chapters shipped with the reader. Names of
// locations, cited historical figures, translators and clothing are excluded.
// Only the first appearance is used for notes: no later plot developments.
const CAST = {
  "thien-su-nha-ben": [
    ["amane", "Fujimiya Amane", ["Amane", "Amane Fujimiya"], "Nam sinh sống một mình trong căn hộ cạnh Mahiru; khá trầm tính và không giỏi giao tiếp."],
    ["mahiru", "Shiina Mahiru", ["Mahiru", "Mahirun", "Mahiru Shiina"], "Hàng xóm của Amane, học cùng trường; được gọi là thiên sứ vì vẻ ngoài và thành tích nổi bật."],
    ["itsuki", "Akazawa Itsuki", ["Itsuki", "Ikkun", "Itsuki Akazawa"], "Bạn thân cùng lớp của Amane; vui vẻ, hoạt bát và hay trêu cậu."],
    ["chitose", "Shirakawa Chitose", ["Chitose", "Chii", "Chitose Shirakawa"], "Bạn gái của Itsuki; có tính cách cởi mở, năng động và thân thiện."],
    ["yuuta", "Kadowaki Yuuta", ["Yuuta", "Kadowaki", "Yuuta Kadowaki"], "Bạn học nổi tiếng của Amane, thuộc đội điền kinh; được các bạn gọi là hoàng tử."],
    ["shihoko", "Fujimiya Shihoko", ["Shihoko", "Shihoko Fujimiya"], "Mẹ của Amane; vui vẻ, nhiệt tình và thích trêu con trai."],
    ["shuuto", "Fujimiya Shuuto", ["Shuuto", "Shuto", "Shuuto Fujimiya"], "Bố của Amane, chồng của Shihoko; là người điềm đạm và quan tâm gia đình."],
    ["risa", "Risa", [], "Một nữ sinh trong trường, được nhắc đến trong câu chuyện về lần đi chùa đầu năm."],
    ["koyuki", "Koyuki", [], "Người giúp việc từng chăm sóc Mahiru; là một người lớn được Mahiru nhắc tới trong ký ức tuổi nhỏ."],
    ["sayo", "Shiina Sayo", ["Sayo", "Saya", "Sayo Shiina"], "Mẹ ruột của Mahiru. Mối quan hệ giữa hai người được kể khi bà xuất hiện tại căn hộ."],
    ["yamazaki", "Yamazaki", [], "Bạn học trong giờ thực hành nấu ăn, bị va phải khi những nam sinh khác đùa nghịch."],
    ["silk", "Silk", [], "Bé mèo ở quán cà phê mèo mà Amane và Mahiru ghé thăm; có lông trắng, vùng mặt và đuôi sẫm màu."],
    ["kazuya", "Hiragi Kazuya", ["Kazuya", "Hiragi", "Hiiragi Kazuya", "Hiiragi", "Kazu"], "Bạn thân của Yuuta trong đội điền kinh; nghiêm túc, thật thà và giỏi chạy cự li dài."],
    ["makoto", "Kokonoe Makoto", ["Makoto", "Kokonoe", "Makochin"], "Bạn thân của Yuuta; có vóc dáng nhỏ nhắn và thường đi cùng Kazuya."],
    ["ayaka", "Kido Ayaka", ["Ayaka", "Kido", "Ayaka Kido"], "Bạn cùng lớp của Amane và Mahiru; vui vẻ, tinh ý và giỏi làm dịu bầu không khí."],
    ["toujou", "Toujou", ["Tojo", "Toujo"], "Người bạn thời cấp hai mà Amane gặp lại khi trở về quê."],
    ["hanada", "Hanada", [], "Bạn thời nhỏ của Amane ở quê; anh trai của Kaname."],
    ["kaname", "Hanada Kaname", ["Kaname", "Kaname Hanada"], "Em gái của Hanada, quen biết Amane từ khi còn nhỏ."],
    ["daiki", "Akazawa Daiki", ["Daiki", "Daiki Akazawa"], "Bố của Itsuki; coi trọng gia thế và có những kỳ vọng riêng đối với con trai."],
    ["asahi", "Shiina Asahi", ["Asahi", "Asahi Shiina"], "Bố của Mahiru; tên của ông xuất hiện trên thư gửi cho cô."],
    ["souji", "Kayano Souji", ["Souji", "Sou", "Kayano", "Souji Kayano"], "Bạn trai của Ayaka; ít nói, ngại người lạ và được Ayaka giới thiệu với Amane tại lễ hội văn hóa."],
    ["fumika", "Itomaki Fumika", ["Fumika", "Itomaki", "Fumika Itomaki"], "Dì của Ayaka và chủ quán cà phê nơi Amane đến xin làm thêm."],
    ["kaori", "Kaori", [], "Mẹ của Ayaka, được nhắc đến trong cuộc trò chuyện về gia đình và việc nhà."],
    ["daichi", "Miyamoto Daichi", ["Daichi", "Miyamoto", "Daichi Miyamoto"], "Đồng nghiệp của Amane tại quán cà phê; thân thiện và sẵn sàng hướng dẫn người mới."],
    ["rino", "Oohashi Rino", ["Rino", "Oohashi", "Ohashi Rino", "Rino Oohashi"], "Đồng nghiệp của Amane tại quán cà phê; hoạt bát và thường trêu đùa với Miyamoto."],
    ["suzuki", "Suzuki", [], "Bạn học được nhắc đến trong câu chuyện về những quan hệ của Mahiru ở trường."],
    ["inoue", "Inoue", [], "Một nữ sinh nói chuyện với Mahiru về Suzuki."],
    ["konishi", "Konishi", [], "Bạn nữ cùng lớp với Amane và Mahiru; bạn thân của Hibiya."],
    ["hibiya", "Hibiya", [], "Bạn nữ cùng lớp với Amane và Mahiru; thường giao tiếp với các bạn trong lớp."],
    ["minase", "Minase", [], "Một đàn chị cùng làm tại quán cà phê với Amane và Souji."]
  ],
  "tinh-yeu-vo-hinh": [
    ["kakeru", "Kakeru Sorano", ["Kakeru", "Sorano", "Sorano Kakeru"], "Sinh viên đại học khá hướng nội, sống cùng phòng ký túc xá với Narumi."],
    ["koharu", "Koharu Fuyutsuki", ["Koharu", "Fuyutsuki", "Fuyutsuki Koharu"], "Nữ sinh đại học không nhìn thấy nhưng luôn vui vẻ, thích pháo hoa; gặp Kakeru tại buổi chào đón thành viên mới."],
    ["narumi", "Ushio Narumi", ["Narumi", "Ushio", "Narumi Ushio"], "Bạn cùng phòng ký túc xá của Kakeru; hoạt bát, nói giọng Kansai và rủ cậu đến buổi tiệc."],
    ["yuuko", "Yuuko Hayase", ["Yuuko", "Hayase", "Yuko Hayase", "Hayase Yuuko"], "Bạn thân của Koharu từ khi nhập học; năng nổ, thường giúp đỡ và đồng hành cùng cô."],
    ["yuichi", "Yuichi Kotomugi", ["Yuichi", "Kotomugi", "Kotomugi Yuichi"], "Hội trưởng Hội nghiên cứu pháo hoa; Kakeru và Koharu gặp anh khi tìm hiểu việc bắn pháo hoa."],
    ["sumire", "Sumire", [], "Một em nhỏ được nhắc đến trong hoạt động tình nguyện tại bệnh viện."],
    ["hiroto", "Hiroto", [], "Một em nhỏ tham gia vẽ mẫu pháo hoa trong hoạt động tại bệnh viện; yêu nụ cười của mẹ."],
    ["sakura", "Sakura", [], "Con gái của Kakeru và Koharu, xuất hiện trong chương kể từ góc nhìn Kakeru ở cuối tập đầu."],
    ["ayakawa", "Ayakawa", [], "Bạn cùng lớp thường nhắc Koharu khi đổi phòng học, chủ động trò chuyện và đề nghị đi cùng cô."],
    ["yoshiko", "Yoshiko", [], "Bà nội của Kakeru; sống ở Niigata và được nhắc tới trong câu chuyện về gia đình."],
    ["kyoko", "Kyoko", [], "Mẹ của Kakeru; giàu năng lượng, nhiệt tình và quan tâm tới con trai."],
    ["soichiro", "Soichiro Fuyutsuki", ["Soichiro", "Souichiro", "Fuyutsuki Soichiro"], "Bố của Koharu, được Kakeru gặp và trò chuyện trong một bữa ăn."],
    ["haruka", "Haruka Fuyutsuki", ["Haruka", "Fuyutsuki Haruka"], "Mẹ của Koharu, vợ của Soichiro; là người gần gũi, chăm sóc và hỗ trợ con gái."]
  ]
};

const LEGACY = {
  "thien-su-nha-ben": {
    amane: ["Fujimiya Amane", ["Amane"], "Nam sinh sống một mình; hàng xóm của Shiina Mahiru."],
    mahiru: ["Shiina Mahiru", ["Mahiru"], "Học cùng trường với Amane; được mọi người gọi là thiên sứ."]
  },
  "tinh-yeu-vo-hinh": {
    kakeru: ["Kakeru Sorano", ["Kakeru", "Sorano"], "Sinh viên đại học, bạn cùng phòng ký túc xá của Narumi."],
    koharu: ["Koharu Fuyutsuki", ["Koharu", "Fuyutsuki"], "Cô gái Kakeru gặp tại buổi chào đón thành viên mới."],
    narumi: ["Narumi", [], "Bạn cùng phòng ký túc xá, người rủ Sorano đến buổi tiệc."]
  }
};

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
const catalog = { revision: 1, series: {} };
const docs = ["# Danh sách nhân vật", "", "Rà từ toàn bộ chương hiện có trong ứng dụng, gồm nhân vật được gọi tên và bé mèo Silk. Ghi chú chỉ mô tả vai trò, không kể diễn biến về sau. Nhân vật chưa có họ hoặc tên đầy đủ trong bản dịch được giữ theo tên đã xuất hiện.", "", "Tên nhân vật chính đã đối chiếu với [Thiên Sứ Nhà Bên](https://otonarino-tenshisama.jp/) và [Tình yêu vô hình](https://sh-anime.shochiku.co.jp/kakekoi/). Mốc mở khóa dựa trên bản dịch trong ứng dụng."];

for (const series of read("public/data/series.json")) {
  const volumes = read(path.join("public", series.index));
  const entries = volumes.flatMap((v, vi) => read(path.join("public", v.text)).map((text, ci) => ({ text, vi, ci, volume: v, chapter: v.chapters[ci] })));
  const first = entries.find((entry) => !entry.chapter.isIllustration);
  const characters = CAST[series.slug].map(([key, name, aliases, note]) => {
    const terms = [name, ...aliases].map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${terms.join("|")})(?![\\p{L}\\p{N}_])`, "iu");
    const entry = entries.find((item) => !item.chapter.isIllustration && pattern.test(item.text));
    if (!entry) throw Error(`No appearance found: ${series.slug}/${name}`);
    const legacy = LEGACY[series.slug]?.[key];
    return {
      key, name, aliases, note,
      gate: `${entry.volume.dirName}\u001f${entry.chapter.title.normalize("NFC")}`,
      appearance: { volume: entry.volume.name, chapter: entry.chapter.title },
      ...(legacy ? { legacy: { name: legacy[0], aliases: legacy[1], note: legacy[2], gate: `${first.volume.dirName}\u001f${first.chapter.title.normalize("NFC")}` } } : {})
    };
  }).sort((a, b) => entries.findIndex((e) => `${e.volume.dirName}\u001f${e.chapter.title.normalize("NFC")}` === a.gate) - entries.findIndex((e) => `${e.volume.dirName}\u001f${e.chapter.title.normalize("NFC")}` === b.gate));
  catalog.series[series.slug] = characters;
  docs.push("", `## ${series.titleVi} — ${characters.length} nhân vật`, "", "| Nhân vật | Vai trò / ghi chú | Mở từ |", "| --- | --- | --- |");
  for (const character of characters) docs.push(`| ${character.name} | ${character.note} | ${character.appearance.volume} · ${character.appearance.chapter} |`);
  console.log(`${series.slug}: ${characters.length} characters`);
}

fs.writeFileSync(path.join(ROOT, "public/reader-characters.js"), `// Generated by scripts/build-character-catalog.js. Edit the curated cast there.\n(function (root) {\n  const catalog = ${JSON.stringify(catalog, null, 2)};\n  if (typeof module === "object" && module.exports) module.exports = catalog;\n  else root.ReaderCharacters = catalog;\n})(typeof globalThis === "object" ? globalThis : this);\n`);
fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "docs/character-catalog.md"), docs.join("\n") + "\n");
