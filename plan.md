# Kế hoạch tính năng

## Điều khiển bằng tay qua camera — Beta

Trạng thái: đã triển khai bản Beta dành cho máy tính; cần đánh giá thêm nhận diện với webcam thật.

- Chụm ngón cái và ngón trỏ để giữ trang, kéo tay lên/xuống để di chuyển nội dung theo tay, mở ngón để thả.
- Mở bàn tay, giữ một nhịp rồi phất lên/xuống để cuộn nửa hoặc một màn hình; chỉnh độ nhạy.
- Dùng webcam, nhận diện ngay trên thiết bị, mặc định tắt và chỉ xin quyền khi bấm bật. Không hỗ trợ điện thoại/máy tính bảng.
- Đặt khung xem trước, cài đặt, thu gọn và nút tắt trong thanh trái; tạm dừng khi mở cài đặt/chọn chữ, tắt camera khi rời trang đọc, chuyển ứng dụng hoặc thanh trái bị ẩn do thu nhỏ cửa sổ.
- Cài đặt được lưu và sao lưu cùng dữ liệu đọc; bộ nhận diện tải khi sử dụng lần đầu và có cache offline.
- Việc tiếp theo: thử webcam trên máy tính ở nhiều điều kiện ánh sáng, tinh chỉnh ngưỡng và tốc độ kéo theo phản hồi. Cân nhắc tốc độ kéo tùy chỉnh, hiệu chỉnh cử chỉ và chế độ tiết kiệm pin sau khi đánh giá Beta.

Chi tiết: [docs/hand-camera.md](docs/hand-camera.md).

## Điều khiển bằng cảm biến chuyển động trên điện thoại

Trạng thái: dự kiến triển khai.

Mục tiêu: hỗ trợ đọc bằng một tay, giảm thao tác vuốt và lưu nhanh vị trí đang đọc bằng cảm biến chuyển động/hướng máy.

### Danh sách tính năng

| Ưu tiên | Thao tác | Hành vi dự kiến |
| --- | --- | --- |
| P1 | Nghiêng máy để tự cuộn | Lấy tư thế cầm máy làm mốc. Nghiêng để cuộn, nghiêng thêm để tăng tốc; đưa về tư thế ban đầu để dừng. Cho phép chỉnh tốc độ tối đa. |
| P1 | Lắc nhẹ để bookmark | Lưu vị trí đang đọc vào danh sách bookmark hiện có. Hiện thông báo và nút hoàn tác để xử lý thao tác nhầm. |
| P2 | Úp máy để tạm dừng | Tạm dừng nghe truyện hoặc tự cuộn khi máy được úp xuống ổn định. Không tự phát lại âm thanh khi ngửa máy. |
| P2 | Nghiêng trái/phải để lật trang | Chuyển tới vùng đọc trước/sau bằng một tay. Mỗi lần nghiêng chỉ chuyển một lần; phải đưa máy về mốc trước thao tác tiếp theo. |
| P2 | Lắc để gia hạn hẹn giờ ngủ | Khi đang nghe và hẹn giờ sắp hết, cho phép lắc để cộng thêm thời gian đã chọn. Không đồng thời tạo bookmark. |
| P3 | Nghiêng để tạo chiều sâu cho bìa/minh họa | Dịch chuyển nhẹ ảnh theo góc máy. Có tùy chọn riêng và tôn trọng thiết lập giảm chuyển động. |

### Cài đặt và hành vi chung

- Thêm mục **Điều khiển bằng chuyển động** trong cài đặt đọc; mặc định tắt.
- Cho phép bật/tắt từng tính năng, chỉnh độ nhạy và lấy lại tư thế cầm máy làm mốc.
- Tự cuộn và lật trang bằng nghiêng là hai chế độ thay thế nhau, tránh kích hoạt cùng lúc.
- Khi bật, kiểm tra cảm biến và dữ liệu thực tế; thông báo rõ nếu thiết bị/trình duyệt không hỗ trợ hoặc quyền bị từ chối.
- Xin quyền cảm biến từ thao tác bấm nút của người dùng trên trình duyệt yêu cầu quyền; dùng HTTPS khi triển khai.
- Lọc rung nhẹ, yêu cầu cử chỉ đủ rõ và có khoảng nghỉ giữa hai lần kích hoạt.
- Tạm dừng điều khiển khi người dùng chọn chữ, mở cửa sổ tiện ích/cài đặt, rời trang đọc hoặc chuyển ứng dụng. Không dựa vào cảm biến để điều khiển khi đã khóa màn hình.
- Hiệu chỉnh lại hướng/mốc khi đổi giữa màn hình dọc và ngang; dừng thao tác đang chạy trong lúc hiệu chỉnh.
- Lưu lựa chọn cùng cài đặt đọc và đưa vào sao lưu/khôi phục hiện có.
- Tái sử dụng luồng bookmark, chuyển trang, nghe truyện và hẹn giờ hiện có.

### Thứ tự triển khai

1. Khả năng truy cập cảm biến, xin quyền, cài đặt và hiệu chỉnh.
2. Tự cuộn bằng nghiêng và bookmark bằng lắc.
3. Úp máy để tạm dừng, nghiêng để lật trang và gia hạn hẹn giờ ngủ.
4. Hiệu ứng chiều sâu cho bìa/minh họa.

### Tiêu chí nghiệm thu

- Kiểm tra trên điện thoại Android và iPhone với trình duyệt hỗ trợ, gồm cấp quyền, từ chối quyền và thiếu dữ liệu cảm biến.
- Cử chỉ rõ chỉ kích hoạt một lần; rung nhẹ hoặc đổi hướng màn hình không tự tạo bookmark/chuyển trang.
- Tự cuộn dừng đúng lúc, không làm mất vị trí đọc và không thao tác phía sau cửa sổ đang mở.
- Bookmark có thể hoàn tác; gia hạn hẹn giờ không tạo bookmark và chỉ hoạt động khi có hẹn giờ nghe.
- Khi tắt tính năng hoặc rời trang đọc, ngừng xử lý cảm biến; các thao tác đọc thông thường tiếp tục dùng được.

### Tài liệu tham khảo

- [Device orientation events — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events)
- [DeviceMotionEvent.requestPermission — MDN](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static)
