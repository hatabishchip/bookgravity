"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

// Illustrated "how to start a class" guide for trainers. English by default
// with a Bahasa Indonesia toggle scoped to THIS page only (not the whole app).
// Images live in /public/instructions. Step 3 is intentionally text-only.

type Lang = "en" | "id"

type Content = { title: string; body?: string; lines?: string[]; bullets?: string[] }
type Step = { num: number; images?: string[]; en: Content; id: Content }

const STEPS: Step[] = [
  {
    num: 0,
    images: ["/instructions/step0.jpg"],
    en: { title: "Tie your hair up", body: "Tie your hair back so it stays out of the way during practice." },
    id: { title: "Ikat rambut Anda", body: "Ikat rambut ke belakang agar tidak mengganggu saat latihan." },
  },
  {
    num: 1,
    images: ["/instructions/step1.jpg"],
    en: { title: "Everyone takes off their socks", body: "Ask everyone to remove their socks before starting." },
    id: { title: "Semua melepas kaus kaki", body: "Minta semua orang melepas kaus kaki sebelum mulai." },
  },
  {
    num: 2,
    images: ["/instructions/step2.jpg"],
    en: {
      title: "Sit everyone on the mat and explain",
      lines: [
        "We all know how gravity works.",
        "It pushes us down and it compresses us.",
        "In Gravity Stretching, we use gravity to help us.",
        "When we lock with our hands or feet, gravity does not compress us.",
      ],
    },
    id: {
      title: "Dudukkan semua orang di matras dan jelaskan",
      lines: [
        "Kita semua tahu bagaimana gravitasi bekerja.",
        "Itu menekan kita ke bawah dan itu memampatkan kita.",
        "Dalam Gravity Stretching, kita menggunakan gravitasi untuk membantu kita.",
        "Saat kita mengunci dengan tangan atau kaki, gravitasi tidak memampatkan kita.",
      ],
    },
  },
  {
    num: 3,
    en: {
      title: "Three key principles",
      bullets: [
        "Relaxation",
        "Breathing — we learn to combine the breath with relaxation",
        "We never work through pain",
      ],
    },
    id: {
      title: "Tiga prinsip utama",
      bullets: [
        "Relaksasi",
        "Pernapasan — kita belajar menggabungkan napas dengan relaksasi",
        "Kita tidak pernah memaksa melalui rasa sakit",
      ],
    },
  },
  {
    num: 4,
    images: ["/instructions/step4a.jpg", "/instructions/step4b.jpg"],
    en: {
      title: "Combine breathing with movement",
      lines: [
        "1) Open the arms wide to the sides.",
        "2) Open the arms, fold forward, and bring the hands behind the back.",
      ],
    },
    id: {
      title: "Gabungkan napas dengan gerakan",
      lines: [
        "1) Buka lengan lebar-lebar ke samping.",
        "2) Buka lengan, membungkuk ke depan, lalu bawa tangan ke belakang punggung.",
      ],
    },
  },
  {
    num: 5,
    images: ["/instructions/step5.jpg"],
    en: { title: "Check the loops", body: "Each person's loops should sit about 10 cm below the elbows." },
    id: { title: "Periksa lup", body: "Lup setiap orang harus berada sekitar 10 cm di bawah siku." },
  },
  {
    num: 6,
    images: ["/instructions/step6.jpg"],
    en: { title: "Don't over-tighten the lockers", body: "If they're too tight, the fingers start to hurt quickly." },
    id: { title: "Jangan terlalu mengencangkan pengunci", body: "Jika terlalu ketat, jari akan cepat terasa sakit." },
  },
  {
    num: 7,
    images: ["/instructions/step7.jpg"],
    en: { title: "Nose off the floor", body: "Make sure the nose does not touch the floor." },
    id: { title: "Hidung tidak menyentuh lantai", body: "Pastikan hidung tidak menyentuh lantai." },
  },
  {
    num: 8,
    images: ["/instructions/step8.jpg"],
    en: { title: "Thigh stays down", body: "When tucking the leg, the thigh should rest on the floor — at most one palm's width above it." },
    id: { title: "Paha tetap di lantai", body: "Saat menekuk kaki, paha harus menempel di lantai — maksimal satu telapak tangan di atasnya." },
  },
]

export default function TrainerInstructionPage() {
  const [lang, setLang] = useState<Lang>("en")

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">How to start a class</h1>
        {/* Language toggle — scoped to this guide only */}
        <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5 flex-shrink-0">
          {(["en", "id"] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium",
                lang === l ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {l === "en" ? "EN" : "ID"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-gray-500 text-xs lg:text-sm mb-6">
        {lang === "en"
          ? "Follow these steps at the start of every class."
          : "Ikuti langkah-langkah ini di awal setiap kelas."}
      </p>

      <div className="space-y-4">
        {STEPS.map((step) => {
          const c = step[lang]
          return (
            <div key={step.num} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {step.images && step.images.length > 0 && (
                <div className={cn("grid gap-0.5 bg-gray-100", step.images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                  {step.images.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt={c.title} className="w-full h-48 sm:h-56 object-cover" />
                  ))}
                </div>
              )}
              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center">
                    {step.num}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-gray-900">{c.title}</h2>
                    {c.body && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{c.body}</p>}
                    {c.lines && (
                      <div className="mt-2 space-y-1.5">
                        {c.lines.map((line, i) => (
                          <p key={i} className="text-sm text-gray-700 leading-relaxed">
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                    {c.bullets && (
                      <ul className="mt-2 space-y-1.5">
                        {c.bullets.map((b, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
