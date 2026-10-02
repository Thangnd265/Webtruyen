import { useState } from "react";
import { PricingCard } from "../components/PricingCard";
import { AuthModal } from "../components/AuthModal";
import { useAuth } from "../context/AuthContext";
import { membershipPlans } from "../data/site";
import type { MembershipPlan } from "../data/types";

const plans: MembershipPlan[] = [
  {
    id: "free",
    name: "Tài Khoản Gia Đình",
    price: 0,
    durationDays: 0,
    benefits: [
      "Tài khoản & mật khẩu riêng cho từng người",
      "Ghi nhớ tiến độ đọc và nghe độc lập",
      "Lưu chủ đề, cỡ chữ, tốc độ nghe riêng",
      "Không bao giờ bị đè lịch sử của nhau",
    ],
  },
  ...membershipPlans,
];

export function MembershipPage() {
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("register");

  return (
    <div className="membership-page">
      <header className="page-heading">
        <p className="eyebrow">DÀNH CHO GIA ĐÌNH</p>
        <h1>Tài Khoản Cá Nhân</h1>
        <p>
          Mỗi thành viên trong gia đình sử dụng tài khoản và mật khẩu riêng.
          Tiến độ nghe, đọc và cài đặt hiển thị sẽ được lưu trữ độc lập trên máy chủ.
        </p>
      </header>
      <div className="pricing-grid">
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            featured={plan.id === "free"}
            onChoose={() => {
              if (!user) {
                setAuthTab("register");
                setAuthOpen(true);
              }
            }}
          />
        ))}
      </div>
      <AuthModal open={authOpen} defaultTab={authTab} onClose={() => setAuthOpen(false)} />
    </div>
  );
}

