import { useState } from "react";
import { Modal } from "../components/Modal";
import { PricingCard } from "../components/PricingCard";
import { membershipPlans } from "../data/site";
import type { MembershipPlan } from "../data/types";

const plans: MembershipPlan[] = [
  { id: "free", name: "Đọc miễn phí", price: 0, durationDays: 0, benefits: ["Đọc truyện miễn phí", "Khám phá kho truyện"] },
  ...membershipPlans,
];

export function MembershipPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  return <div className="membership-page"><header className="page-heading"><p className="eyebrow">DÀNH CHO ĐỘC GIẢ</p><h1>Hội viên</h1><p>Chọn cách đọc phù hợp với bạn. Các gói dưới đây chỉ là nội dung minh họa.</p></header>
    <div className="pricing-grid">{plans.map((plan) => <PricingCard key={plan.id} plan={plan} featured={plan.id === "year"} onChoose={() => setDialogOpen(true)} />)}</div>
    <Modal open={dialogOpen} title="Tài khoản mẫu" onClose={() => setDialogOpen(false)}><p>Đăng nhập và tài khoản chưa có trong bản xem trước.</p></Modal>
  </div>;
}
