import React from 'react';

export const PeopleIllustration: React.FC<{color: string}> = ({color}) => (
  <svg width="140" height="140" viewBox="0 0 140 140">
    <circle cx="50" cy="45" r="18" fill={color} opacity="0.9" />
    <path d="M20 100 Q50 70 80 100 L80 115 L20 115 Z" fill={color} opacity="0.9" />
    <circle cx="95" cy="50" r="15" fill={color} opacity="0.6" />
    <path d="M70 105 Q95 80 120 105 L120 118 L70 118 Z" fill={color} opacity="0.6" />
  </svg>
);

export const MoneyIllustration: React.FC<{color: string}> = ({color}) => (
  <svg width="140" height="140" viewBox="0 0 140 140">
    <circle cx="70" cy="70" r="45" fill="none" stroke={color} strokeWidth="6" />
    <text x="70" y="88" fontSize="50" fill={color} textAnchor="middle" fontFamily="Georgia, serif">₹</text>
  </svg>
);

export const FoodIllustration: React.FC<{color: string}> = ({color}) => (
  <svg width="140" height="140" viewBox="0 0 140 140">
    <ellipse cx="70" cy="90" rx="45" ry="12" fill={color} opacity="0.3" />
    <circle cx="70" cy="60" r="40" fill="none" stroke={color} strokeWidth="6" />
    <line x1="45" y1="60" x2="95" y2="60" stroke={color} strokeWidth="4" />
  </svg>
);

export const PhoneAppIllustration: React.FC<{color: string}> = ({color}) => (
  <svg width="140" height="140" viewBox="0 0 140 140">
    <rect x="40" y="20" width="60" height="100" rx="12" fill="none" stroke={color} strokeWidth="6" />
    <circle cx="70" cy="100" r="6" fill={color} />
    <rect x="52" y="40" width="36" height="8" rx="4" fill={color} opacity="0.7" />
    <rect x="52" y="55" width="24" height="8" rx="4" fill={color} opacity="0.5" />
  </svg>
);

export const ProblemIllustration: React.FC<{color: string}> = ({color}) => (
  <svg width="140" height="140" viewBox="0 0 140 140">
    <path d="M70 20 L120 110 L20 110 Z" fill="none" stroke={color} strokeWidth="6" />
    <line x1="70" y1="55" x2="70" y2="80" stroke={color} strokeWidth="6" strokeLinecap="round" />
    <circle cx="70" cy="95" r="4" fill={color} />
  </svg>
);

export const RocketIllustration: React.FC<{color: string}> = ({color}) => (
  <svg width="140" height="140" viewBox="0 0 140 140">
    <path d="M70 20 Q90 50 85 90 L55 90 Q50 50 70 20 Z" fill="none" stroke={color} strokeWidth="6" />
    <circle cx="70" cy="55" r="8" fill={color} />
    <path d="M55 90 L40 110 M85 90 L100 110" stroke={color} strokeWidth="6" strokeLinecap="round" fill="none" />
  </svg>
);

const KEYWORD_MAP: {keywords: string[]; component: React.FC<{color: string}>}[] = [
  {keywords: ['student', 'hostel', 'dorm', 'college', 'friend', 'together', 'group', 'people', 'community'], component: PeopleIllustration},
  {keywords: ['pay', 'fee', 'cost', 'money', 'discount', 'bill', 'price', 'save', 'saving', 'cheap', 'expensive', 'budget'], component: MoneyIllustration},
  {keywords: ['food', 'eat', 'meal', 'delivery', 'restaurant', 'order', 'dish', 'cook'], component: FoodIllustration},
  {keywords: ['app', 'phone', 'digital', 'online', 'tech', 'platform', 'website', 'software'], component: PhoneAppIllustration},
  {keywords: ['tired', 'unfair', 'frustrat', 'problem', 'struggle', 'difficult', 'annoying', 'sick of', 'high'], component: ProblemIllustration},
];

export function getIllustrationForText(text: string): React.FC<{color: string}> {
  const lower = text.toLowerCase();
  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return entry.component;
    }
  }
  return RocketIllustration; // default fallback
}