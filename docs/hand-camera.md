# Điều khiển bằng tay — Beta

Trên máy tính, mở một chương và bấm **Bật camera** trong mục **Điều khiển bằng tay · Beta** ở thanh bên trái. Khung webcam, nút tắt và **Cài đặt & hướng dẫn** nằm ngay trong thanh này. Các lối vào từ Tiện ích đọc/Cài đặt đọc đưa bạn đến mục đó, không mở popup. Tính năng mặc định tắt và không tự bật lại sau khi tải trang.

## Thao tác

- **Chụm ngón cái và ngón trỏ để kéo trang:** chụm sát hai đầu ngón, giữ một nhịp đến khi hiện vòng tròn xanh rồi di chuyển tay lên/xuống; nội dung đi theo tay. Cần ít nhất 3 lần nhận diện liên tiếp trong tối thiểu 160 ms để xác nhận. Mở hai ngón ra để thả. Khi mất dấu tay, đổi tay hoặc mở bảng điều khiển, mốc kéo được đặt lại để tránh trang nhảy.
- **Phất tay để cuộn:** mở bàn tay trong khung camera, giữ một nhịp rồi phất lên để cuộn xuống, phất xuống để cuộn lên. Một lần phất cuộn nửa hoặc một màn hình, có độ nhạy 1–5 và khoảng nghỉ trước lần tiếp theo.
- Camera ưu tiên thao tác chụm ngón khi đang giữ trang, tránh kích hoạt đồng thời phất tay. Kéo trang chuyển động đều giữa các lần nhận diện camera; mở ngón, mất dấu tay hoặc dùng chuột/bàn phím sẽ hủy phần cuộn đang chờ. Tôn trọng thiết lập giảm chuyển động của hệ điều hành. Không chuyển chương bằng cử chỉ ngang.
- Khung camera có thể thu gọn; nút **Tắt camera** vẫn hiện trong thanh bên khi tính năng chạy. Mở phần **Cài đặt & hướng dẫn**, bảng điều khiển khác hoặc bôi đen chữ sẽ tạm dừng xử lý cử chỉ.
- Camera và bộ nhận diện dừng khi bấm tắt, rời trang đọc, chuyển ứng dụng/tab hoặc thu nhỏ cửa sổ làm thanh bên bị ẩn. Nút tắt cũng hủy quá trình chuẩn bị; yêu cầu quyền trả về muộn được giải phóng.

Đặt máy ổn định và sử dụng nơi đủ sáng. Đây là bản Beta: độ chính xác phụ thuộc ánh sáng, tư thế tay, webcam và hiệu năng máy. Chỉ hỗ trợ máy tính với cửa sổ rộng trên 1080 px để có thanh bên trái. Các lối vào và panel được ẩn trên điện thoại/máy tính bảng, đồng thời chặn bật camera trên các thiết bị này, kể cả màn hình rộng.

## Dữ liệu và trình duyệt

- Hình ảnh được xử lý cục bộ, không ghi lại hoặc gửi lên máy chủ. Không xin quyền micro.
- Dùng HTTPS khi triển khai; localhost được phép để phát triển. Trình duyệt cần hỗ trợ camera, module Worker, OffscreenCanvas và ImageBitmap; nếu bộ nhận diện không khởi động được, ứng dụng thông báo và tắt camera.
- Bộ nhận diện khoảng 20 MB chỉ tải khi bật camera lần đầu. Service worker lưu các tệp để tái sử dụng, kể cả khi offline nếu cache vẫn còn. Chúng không nằm trong gói nạp ban đầu hoặc bản sao lưu ZIP.
- Độ nhạy và khoảng cuộn được lưu tại `tenshi-hand-camera-v1`, tham gia sao lưu/khôi phục hiện có. Trạng thái camera đang bật không được lưu.

## Triển khai

`public/hand-gestures.js` xử lý giao diện, vòng đời camera và hai bộ phát hiện cử chỉ. `public/hand-camera-worker.js` chạy MediaPipe Hand Landmarker trong worker với CPU delegate. Mỗi lần chỉ gửi một frame đang chờ kết quả, giãn ít nhất 80 ms giữa các lượt và đóng ImageBitmap sau suy luận.

MediaPipe Tasks Vision được khóa phiên bản 1.0.1. Runtime và model trong `public/vendor/mediapipe/` dùng giấy phép Apache 2.0; nguồn và SHA-256 model nằm trong `NOTICE.txt`. Chạy `npm run vendor-hand-camera` để sao chép lại runtime từ gói đã cài và kiểm tra checksum model. Model đã được lưu cùng dự án, không tải từ CDN khi người dùng đọc.

Kiểm tra tự động bao gồm hướng cuộn, giữ tay lâu, chống rung/cuộn lặp, mất dấu/đổi tay, chụm/kéo/thả và đặt lại mốc. Kiểm tra trình duyệt dùng model thật với camera trắng giả lập, sau đó đưa landmarks giả lập vào kết quả để xác minh cuộn trang, tạm dừng, thu gọn, giải phóng tài nguyên và xử lý từ chối quyền. Cần tiếp tục đánh giá nhận diện bàn tay với webcam thật trên máy tính.
