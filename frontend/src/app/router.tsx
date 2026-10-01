import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "../components/Layout";
import { NotFoundPage } from "../pages/NotFoundPage";
import { HomePage } from "../pages/HomePage";
import { CatalogPage } from "../pages/CatalogPage";
import { SearchPage } from "../pages/SearchPage";
import { RankingsPage } from "../pages/RankingsPage";
import { MembershipPage } from "../pages/MembershipPage";
import { StoryPage } from "../pages/StoryPage";
import { ReaderPage } from "../pages/ReaderPage";
import { AudioPage } from "../pages/AudioPage";
import { InfoPage } from "../pages/InfoPage";

export function App() {
  return <Layout><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/truyen" element={<CatalogPage />} />
    <Route path="/truyen/audio" element={<CatalogPage title="Truyện audio" audioOnly />} />
    <Route path="/truyen/search" element={<SearchPage title="Tìm truyện" />} />
    <Route path="/tim-kiem" element={<SearchPage />} />
    <Route path="/bang-xep-hang" element={<RankingsPage />} />
    <Route path="/hoi-vien" element={<MembershipPage />} />
    <Route path="/truyen/:slug" element={<StoryPage />} />
    <Route path="/truyen/:slug/doc/:chapter" element={<ReaderPage />} />
    <Route path="/truyen/:slug/nghe/:chapter" element={<AudioPage />} />
    <Route path="/gioi-thieu" element={<InfoPage key="about" title="Giới thiệu" introduction="Một góc nhỏ dành cho những câu chuyện và người yêu đọc sách." sections={[
      { heading: "Khám phá câu chuyện của bạn", text: "Người Yêu Cũ mang đến trải nghiệm khám phá truyện theo thể loại, theo dõi bảng xếp hạng và đọc từng chương trong không gian gọn gàng, dễ sử dụng.", items: ["Tìm truyện theo tên, thể loại và trạng thái hoàn thành.", "Tùy chỉnh chủ đề, cỡ chữ và giãn dòng khi đọc.", "Khám phá giao diện nghe truyện với trình phát mẫu."] },
      { heading: "Về bản xem trước", text: "Đây là bản dựng giao diện với truyện và nội dung minh họa. Tài khoản, thanh toán và phát âm thanh thực tế chưa được kết nối. Các gói hội viên chỉ dùng để trải nghiệm giao diện." },
    ]} />} />
    <Route path="/lien-he" element={<InfoPage key="contact" title="Liên hệ" introduction="Chia sẻ góp ý để trải nghiệm đọc truyện ngày một dễ chịu hơn." contact sections={[
      { heading: "Chúng tôi lắng nghe", text: "Bạn có thể thử biểu mẫu bên dưới để mô tả góp ý về giao diện hoặc một vấn đề khi đọc truyện. Đây là biểu mẫu mẫu, chưa kết nối với đội ngũ hỗ trợ.", items: ["Nêu tên trang hoặc truyện mà bạn đang xem.", "Mô tả điều bạn mong đợi và điều đã xảy ra.", "Không nhập mật khẩu, thông tin thanh toán hoặc dữ liệu nhạy cảm."] },
    ]} />} />
    <Route path="/dieu-khoan" element={<InfoPage key="terms" title="Điều khoản" introduction="Thông tin sử dụng dành riêng cho bản xem trước giao diện." sections={[
      { heading: "Phạm vi trải nghiệm", text: "Các truyện, chương, đánh giá và gói hội viên trên trang là dữ liệu mẫu để kiểm tra giao diện. Không có giao dịch, đăng ký tài khoản hoặc quyền truy cập trả phí được tạo ra." },
      { heading: "Sử dụng có trách nhiệm", text: "Khi khám phá bản mẫu, vui lòng lưu ý:", items: ["Tôn trọng tác giả và quyền sử dụng nội dung.", "Không dùng dữ liệu minh họa làm thông tin dịch vụ chính thức.", "Không gửi thông tin cá nhân nhạy cảm qua biểu mẫu thử nghiệm."] },
      { heading: "Góp ý và hỗ trợ", text: "Trang Liên hệ giúp bạn thử quy trình nhập góp ý. Nội dung hiện chỉ được kiểm tra tại chỗ, chưa được chuyển tới bất kỳ người nhận nào." },
    ]} />} />
    <Route path="/chinh-sach" element={<InfoPage key="policy" title="Chính sách" introduction="Cách bản xem trước sử dụng dữ liệu và tùy chỉnh trên thiết bị của bạn." sections={[
      { heading: "Tùy chỉnh được lưu trên thiết bị", text: "Chủ đề, chế độ sáng hoặc tối và các tùy chỉnh đọc được lưu trong localStorage của trình duyệt để áp dụng ở lần truy cập tiếp theo. Bạn có thể đặt lại tùy chỉnh trong bảng giao diện hoặc xóa dữ liệu trang trong trình duyệt." },
      { heading: "Biểu mẫu và nội dung mẫu", text: "Biểu mẫu liên hệ không gửi yêu cầu mạng và không lưu tin nhắn. Nội dung đang nhập sẽ mất khi bạn rời trang hoặc tải lại. Trình phát audio không tải tệp âm thanh và các nút hội viên không tạo thanh toán." },
      { heading: "Tài nguyên bên ngoài", text: "Ảnh minh họa có thể được tải từ Unsplash; khi đó trình duyệt kết nối trực tiếp tới máy chủ ảnh. Nếu ảnh không tải được, giao diện vẫn giữ vùng bìa và thông tin truyện để bạn tiếp tục sử dụng." },
    ]} />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></Layout>;
}

export function AppRouter() {
  return <BrowserRouter><App /></BrowserRouter>;
}
