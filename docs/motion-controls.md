# Điều khiển bằng chuyển động

Mở một chương → Cài đặt đọc → Điều khiển bằng chuyển động → Bật cảm biến. Quyền chỉ được xin khi bấm bật. Tính năng mặc định tắt, lựa chọn được lưu trong `tenshi-motion-v1` và đi cùng bản sao lưu đọc hiện có. Không tự bật cảm biến khi tải lại trang.

- Giữ máy yên khoảng một giây để lấy mốc. Nghiêng trước/sau để cuộn; trở về mốc để dừng. Có độ nhạy và tốc độ tối đa.
- Chọn chế độ lật trang để nghiêng trái/phải. Mỗi lần nghiêng chỉ lật một trang; về mốc một nhịp trước lần tiếp theo. Chế độ cuộn và lật trang thay thế nhau.
- Lắc qua lại rõ ba nhịp để lưu vào Đánh dấu & Ghi chú. Thông báo có Hoàn tác trong 10 giây.
- Nếu đang nghe và hẹn giờ còn tối đa hai phút, cùng cử chỉ lắc sẽ cộng khoảng thời gian đã chọn vào thời điểm hết hạn hiện tại, thay vì tạo bookmark.
- Úp máy ổn định để dừng nghe và tự cuộn. Ngửa máy không tự phát âm thanh hoặc tiếp tục cuộn. Bấm Lấy lại mốc / Tiếp tục để cho phép cuộn lại.
- Bật chiều sâu để ảnh minh họa dịch chuyển nhẹ theo máy; thiết lập giảm chuyển động của hệ điều hành vô hiệu hóa hiệu ứng.

Chọn chữ, mở cài đặt hoặc tiện ích làm dừng thao tác. Khi đóng bảng, giữ lại tư thế đọc để lấy mốc mới. Đổi hướng màn hình cũng lấy lại mốc. Tắt cảm biến, rời trang đọc hoặc chuyển ứng dụng sẽ tháo bộ nghe sự kiện và dừng cuộn. Có nút Tắt ngoài cài đặt khi cảm biến đang bật.

Trang phải dùng HTTPS (localhost được phép để phát triển). Có trình duyệt cung cấp API nhưng thiết bị không phát dữ liệu: sau năm giây, giao diện thông báo rõ. Nếu chỉ có một loại dữ liệu, các thao tác tương ứng với cảm biến còn thiếu không hoạt động.

## Kiểm tra đã thực hiện

- Kiểm tra thuật toán: mốc, rung nhẹ, quay màn hình, cuộn/lật trang độc lập, úp máy, nhịp lắc và khoảng nghỉ, ưu tiên gia hạn hẹn giờ, dừng cuộn khi thao tác bằng tay.
- Trình duyệt với dữ liệu giả lập ở kích thước điện thoại: từ chối/cấp quyền, cuộn, lưu bookmark và hoàn tác, tắt cảm biến. Camera máy tính vẫn ẩn. Không có lỗi JavaScript.
- Toàn bộ kiểm tra tự động hiện có của dự án chạy thành công.

## Còn cần kiểm tra bằng máy thật

Android và iPhone: cấp/từ chối quyền, cầm dọc/ngang, lắc và úp máy ở các góc cầm khác nhau, chuyển ứng dụng/khóa màn hình, gia hạn khi đang nghe. Cảm biến, tần số dữ liệu và giới hạn trình duyệt khác nhau theo thiết bị; kiểm tra giả lập không thay thế kiểm tra vật lý.

Tham khảo: [Device orientation events](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events), [DeviceMotionEvent.requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static).
