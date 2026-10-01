import { Check } from "lucide-react";
import type { MembershipPlan } from "../data/types";
import { Icon } from "./Icon";

export function PricingCard({ plan, featured, onChoose }: { plan: MembershipPlan; featured?: boolean; onChoose: () => void }) {
  return <article className={`pricing-card${featured ? " pricing-card-featured" : ""}`}>
    {featured && <span className="pricing-badge">Phổ biến</span>}
    <h2>{plan.name}</h2>
    <p className="pricing-price">{plan.price ? plan.price.toLocaleString("vi-VN") + " ₫" : "Miễn phí"}</p>
    <p className="pricing-duration">{plan.durationDays ? `/${plan.durationDays} ngày` : "Đọc truyện mỗi ngày"}</p>
    <ul>{plan.benefits.map((benefit) => <li key={benefit}><Icon icon={Check} size={18} />{benefit}</li>)}</ul>
    <button type="button" className={`button${featured ? " button-primary" : ""}`} onClick={onChoose}>Chọn gói {plan.name}</button>
  </article>;
}
