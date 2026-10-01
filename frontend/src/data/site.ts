import type { Chapter, HeroSlide, MembershipPlan, NavigationGroup, RankingEntry, StoryComment } from "./types";

export const heroSlides: HeroSlide[] = [
  { storyId: "s06", eyebrow: "ĐỀ CỬ HÔM NAY", title: "Tiên Lộ Muôn Vàn", description: "Bắt đầu hành trình tu tiên qua những chương truyện mới nhất." },
  { storyId: "s01", eyebrow: "TRUYỆN ĐƯỢC YÊU THÍCH", title: "Nữ Thần Của Lớp Tôi", description: "Một câu chuyện thanh xuân trong trẻo đang được cập nhật." },
  { storyId: "s04", eyebrow: "TOP KIẾM HIỆP", title: "Kiếm Lai Giang Hồ", description: "Theo bước thiếu niên cầm kiếm khám phá giang hồ." },
];

export const comments: StoryComment[] = [
  { id: "c01", storyId: "s01", author: "Mây Nhỏ", content: "Đọc đến chương mới nhất vẫn thấy đáng yêu quá!", createdAt: "2026-09-28T20:05:00+07:00" },
  { id: "c02", storyId: "s06", author: "Độc Giả Ẩn Danh", content: "Nhịp truyện cuốn, mong chương tiếp theo.", createdAt: "2026-09-28T19:20:00+07:00" },
  { id: "c03", storyId: "s12", author: "Lá Xanh", content: "Không khí nhẹ nhàng, hợp đọc cuối ngày.", createdAt: "2026-09-27T22:10:00+07:00" },
];

export const rankings: RankingEntry[] = [
  { storyId: "s06", position: 1 }, { storyId: "s04", position: 2 }, { storyId: "s01", position: 3 },
  { storyId: "s12", position: 4 }, { storyId: "s16", position: 5 },
];

export const membershipPlans: MembershipPlan[] = [
  { id: "month", name: "Thành viên tháng", price: 49000, durationDays: 30, benefits: ["Đọc truyện thành viên", "Huy hiệu tài khoản"] },
  { id: "year", name: "Thành viên năm", price: 499000, durationDays: 365, benefits: ["Đọc truyện thành viên", "Huy hiệu tài khoản", "Tiết kiệm hơn"] },
];

export const chapters: Chapter[] = [
  { id: "s01-c86", storyId: "s01", number: 86, title: "Một lời hẹn sau giờ học", publishedAt: "2026-09-28T10:30:00+07:00" },
  { id: "s06-c427", storyId: "s06", number: 427, title: "Cánh cửa lên núi", publishedAt: "2026-09-29T07:30:00+07:00" },
  { id: "s04-c318", storyId: "s04", number: 318, title: "Khách đến từ phương Bắc", publishedAt: "2026-09-29T08:15:00+07:00" },
  { id: "s01-c3", storyId: "s01", number: 3, title: "Lời nhắn sau giờ học", publishedAt: "2026-09-01T10:30:00+07:00", audioLocked: true },
];

export const navigationGroups: NavigationGroup[] = [
  { title: "Khám phá", links: [{ label: "Trang chủ", href: "/" }, { label: "Danh sách truyện", href: "/truyen" }, { label: "Bảng xếp hạng", href: "/bang-xep-hang" }] },
  { title: "Thể loại", links: [{ label: "Ngôn Tình", href: "/truyen?category=Ng%C3%B4n%20T%C3%ACnh" }, { label: "Tiên Hiệp", href: "/truyen?category=Ti%C3%AAn%20Hi%E1%BB%87p" }, { label: "Học Đường", href: "/truyen?category=H%E1%BB%8Dc%20%C4%90%C6%B0%E1%BB%9Dng" }] },
];
