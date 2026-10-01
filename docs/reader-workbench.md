# Tiện ích sách

Mở **Bản đồ & tiện ích sách** trong thanh bên máy tính, hoặc menu **☰ Tiện ích** ở trang đọc. Trong cài đặt đọc có **Tùy chỉnh tiện ích**.

## Bản đồ, xem trước và X-Ray

- Bản đồ hiển thị độ dài chương theo số từ, phần đã đọc, bookmark ◆ và ghi chú ✎. Chương đang đọc có viền.
- Bấm chương để lật xem trước. Thanh vị trí đi theo độ dài văn bản toàn sách; chọn chương hoặc bookmark/ghi chú để nhảy nhanh trong khung xem trước.
- Khung hiện minh họa và tối đa 16 đoạn từ vị trí chọn. Kéo thanh để xem tiếp. “Về chỗ đang đọc” đóng khung mà không đổi chương hoặc vị trí; “Đọc từ đây” chuyển sang đoạn đã chọn.
- X-Ray dùng tên chính và tên khác trong danh sách nhân vật. Chỉ tìm đến chương xa nhất đã mở; mỗi chương hiện tối đa ba trích đoạn và các nút mở đoạn gốc. Số lần xuất hiện tính toàn bộ kết quả. Chương không tải được được báo riêng, không coi là không có nhân vật.

## Chú giải và sổ từ

- Bôi đen một từ/cụm từ tối đa 80 ký tự trong cùng một đoạn, chọn **Chú giải / Lưu từ**. Nhập nghĩa rồi lưu; chọn **Lưu chú giải & học từ** để giữ cả câu gốc.
- Có thể thêm từ bằng tay trong tab **Chú giải từ**. Chú giải áp dụng theo từng sách; bật **Hiện chú giải trong trang đọc** để thấy nghĩa ngắn phía trên từ. Bấm từ để xem hoặc sửa nghĩa đầy đủ.
- Văn bản nghĩa dùng phần hiển thị CSS, không thêm vào nội dung gốc. Chọn chữ, offset ghi chú và nghe đọc giữ nguyên văn bản truyện. Từ trong ghi chú đã tô màu giữ ưu tiên tương tác ghi chú.
- Sổ từ dùng chung các sách, có câu gốc và nút mở lại nguồn. Thẻ đến hạn có nút hiện nghĩa. **Ôn lại** đặt lịch 10 phút; **Đã nhớ** tăng khoảng ôn theo 1, 3, 7, 14, 30, 60 ngày. Không có dịch tự động hoặc dịch vụ AI.
- Giới hạn 1.000 chú giải và 1.000 từ vựng trên thiết bị.

## Menu nhanh, hồ sơ và thanh trạng thái

- Chọn tối đa tám thao tác cho menu nhanh trong tab **Tùy chỉnh**. Nút Tùy chỉnh luôn có để thay đổi danh sách.
- Lưu tối đa 12 hồ sơ gồm cỡ chữ, giãn dòng, phông, giao diện, màu ảnh, E-Ink, đọc liên tục, chạm lật trang và vùng đọc. Có thể áp dụng, cập nhật hoặc xóa hồ sơ.
- Thanh trạng thái có vị trí trong toàn sách, tiến độ chương và số phút còn lại ước tính theo 280 từ/phút. Có thể ẩn từng mục hoặc ẩn toàn bộ. Thanh tạm ẩn khi trình nghe đang mở.
- Cài đặt, chú giải, từ vựng và hồ sơ lưu ở `tenshi-workbench-v1`, được đưa vào bản sao lưu ZIP hiện có. Không gửi lên máy chủ.

## PDF

- Nhập PDF tại kệ như EPUB/TXT. PDF.js 6.3.289 chạy cục bộ, chỉ tải khi nhập PDF; worker, phông, CMap và WASM phục vụ từ cùng website. Script `npm run vendor-pdf-reader` tái tạo runtime đã ghim phiên bản.
- Tối đa 50 MB/tệp, 500 trang và 150 MB sau chuyển đổi. Mỗi trang trở thành một mục đọc, lưu ảnh JPEG (chiều rộng tối đa 1.500 px, tối đa 2,2 triệu pixel) và văn bản trích xuất. Không lưu tệp PDF gốc; muốn xem nguyên bản độ phân giải cao cần giữ tệp nguồn riêng.
- **Vừa chiều rộng** hiển thị toàn chiều cao trang trong luồng cuộn. **Hai trang** đặt trang hiện tại và trang tiếp theo cạnh nhau; trang kế là xem trước và không tự ghi nhận đã đọc.
- **Phóng vùng**: bật nút rồi kéo hình chữ nhật trên trang bằng chuột hoặc chạm. Zoom tối đa 6 lần; cuộn trong vùng zoom để xem tiếp. **Đặt lại zoom** trở về toàn trang.
- **Văn bản co giãn** dùng văn bản đã trích xuất, hỗ trợ cỡ chữ, nghe và ghi chú. PDF nhiều cột hoặc bố cục phức tạp có thể không giữ đúng thứ tự. Trang dạng ảnh quét hiện hướng dẫn về chế độ ảnh, không tạo văn bản giả.
- Không hỗ trợ PDF có mật khẩu hoặc OCR. PDF và cài đặt đi cùng sao lưu/khôi phục; ảnh trang và văn bản được lưu trong IndexedDB để đọc offline.

## Kiểm tra đã thực hiện

- Logic: chuyển đổi vị trí sách/slider, khớp toàn từ Unicode, dữ liệu nhập có giới hạn, giới hạn raster PDF, tách dòng và khôi phục trang không có văn bản.
- Trình duyệt máy tính: bản đồ, X-Ray, xem trước giữ vị trí và chặn phím chuyển chương phía sau modal; chú giải giữ nguyên `textContent`; ôn từ, hồ sơ, menu nhanh và tùy chọn footer.
- Nhập PDF mẫu ba trang gồm hai trang chữ và một trang đồ họa; hai trang, văn bản, zoom vùng, đặt lại zoom, sao lưu/đọc bản sao lưu và tải lại offline.
- Kiểm tra giao diện rộng 390 px không tràn ngang. Thao tác chạm trên điện thoại thật và PDF nhiều cột/phông đặc biệt còn cần kiểm tra thực tế.
