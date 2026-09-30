# Điều khiển bằng tay — Beta

Mở một chương, chọn **Tiện ích đọc → Điều khiển bằng tay · Beta** hoặc **Cài đặt đọc → Thiết lập camera · Beta**. Bấm **Bật camera** và cấp quyền camera trước. Tính năng mặc định tắt và không tự bật lại sau khi tải trang.

## Thao tác

- **Chụm ngón cái và ngón trỏ để kéo trang:** giữ chụm và di chuyển tay lên/xuống, nội dung đi theo tay. Mở hai ngón ra để thả. Khi mất dấu tay, đổi tay hoặc mở bảng điều khiển, mốc kéo được đặt lại để tránh trang nhảy.
- **Phất tay để cuộn:** mở bàn tay trong khung camera, giữ một nhịp rồi phất lên để cuộn xuống, phất xuống để cuộn lên. Một lần phất cuộn nửa hoặc một màn hình, có độ nhạy 1–5 và khoảng nghỉ trước lần tiếp theo.
- Camera ưu tiên thao tác chụm ngón khi đang giữ trang, tránh kích hoạt đồng thời phất tay. Kéo trang không có quán tính và không chuyển chương bằng cử chỉ ngang.
- Khung camera có thể thu gọn; nút **Tắt camera** vẫn luôn hiện khi tính năng chạy. Mở cài đặt hoặc bôi đen chữ tạm dừng xử lý cử chỉ.
- Camera và bộ nhận diện dừng khi bấm tắt, rời trang đọc hoặc chuyển ứng dụng/tab. Đóng bảng thiết lập khi đang chuẩn bị sẽ hủy bật camera; yêu cầu quyền trả về muộn cũng được giải phóng.

Đặt máy ổn định và sử dụng nơi đủ sáng. Đây là bản Beta: độ chính xác phụ thuộc ánh sáng, tư thế tay, camera và hiệu năng máy. Cần kiểm tra thêm trên Android/iPhone thật; giao diện kích thước điện thoại và luồng camera giả lập đã được kiểm tra trên Chromium.

## Dữ liệu và trình duyệt

- Hình ảnh được xử lý cục bộ, không ghi lại hoặc gửi lên máy chủ. Không xin quyền micro.
- Dùng HTTPS khi triển khai; localhost được phép để phát triển. Trình duyệt cần hỗ trợ camera, module Worker, OffscreenCanvas và ImageBitmap; nếu bộ nhận diện không khởi động được, ứng dụng thông báo và tắt camera.
- Bộ nhận diện khoảng 20 MB chỉ tải khi bật camera lần đầu. Service worker lưu các tệp để tái sử dụng, kể cả khi offline nếu cache vẫn còn. Chúng không nằm trong gói nạp ban đầu hoặc bản sao lưu ZIP.
- Độ nhạy và khoảng cuộn được lưu tại `tenshi-hand-camera-v1`, tham gia sao lưu/khôi phục hiện có. Trạng thái camera đang bật không được lưu.

## Triển khai

`public/hand-gestures.js` xử lý giao diện, vòng đời camera và hai bộ phát hiện cử chỉ. `public/hand-camera-worker.js` chạy MediaPipe Hand Landmarker trong worker với CPU delegate. Mỗi lần chỉ gửi một frame đang chờ kết quả, giãn ít nhất 80 ms giữa các lượt và đóng ImageBitmap sau suy luận.

MediaPipe Tasks Vision được khóa phiên bản 1.0.1. Runtime và model trong `public/vendor/mediapipe/` dùng giấy phép Apache 2.0; nguồn và SHA-256 model nằm trong `NOTICE.txt`. Chạy `npm run vendor-hand-camera` để sao chép lại runtime từ gói đã cài và kiểm tra checksum model. Model đã được lưu cùng dự án, không tải từ CDN khi người dùng đọc.

Kiểm tra tự động bao gồm hướng cuộn, giữ tay lâu, chống rung/cuộn lặp, mất dấu/đổi tay, chụm/kéo/thả và đặt lại mốc. Kiểm tra trình duyệt dùng model thật với camera trắng giả lập, sau đó đưa landmarks giả lập vào kết quả để xác minh cuộn trang, tạm dừng, thu gọn, giải phóng tài nguyên và xử lý từ chối quyền. Các kiểm tra này không thay thế đánh giá nhận diện bàn tay trên điện thoại thật.
