// Step-by-step WhatsApp activation instruction for studio admins.
// Opens in a new tab from /admin/settings → Booking alerts (WhatsApp) →
// "Как подключить WhatsApp" link. Self-contained: no chrome, no nav, just
// the instruction itself so the admin can read alongside the actual
// Facebook flow in another window.
//
// Light theme intentionally — the source mockups were dark to mimic the
// Russian Meta UI, but here we draw them in white so the page reads like
// a regular help doc, not like a Facebook clone.
//
// The "Open Facebook Manager" button at the top is a real link with
// target="_blank" so a single click lands the admin on the right page.

import { Metadata } from "next"
import Link from "next/link"
import { ExternalLink, ArrowRight, Copy } from "lucide-react"

export const metadata: Metadata = {
  title: "Подключение WhatsApp — Gravity Stretching",
  description: "Пошаговая инструкция для активации WhatsApp в новой студии",
}

const FB_URL =
  "https://business.facebook.com/wa/manage/phone-numbers/?asset_id=1571637721189360"

const STEPS = [
  {
    n: 1,
    title: "Открой бизнес-менеджер",
    lines: [
      <>
        Адрес:{" "}
        <a
          href={FB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand font-mono font-medium hover:underline"
        >
          business.facebook.com/wa/manage/phone-numbers
        </a>
      </>,
      <>В правом верхнем углу должно быть выбрано название вашей компании.</>,
    ],
    mock: "phones",
  },
  {
    n: 2,
    title: "Жми синюю кнопку справа",
    lines: [
      <>
        Кнопка: <strong>«Добавить номер телефона»</strong>{" "}
        <span className="text-gray-500">(англ. Add phone number)</span>.
      </>,
    ],
  },
  {
    n: 3,
    title: "Заполни профиль → Далее",
    lines: [
      <>
        <strong>Отображаемое имя</strong> — например{" "}
        <em>Gravity Stretching Bali</em>.
      </>,
      <>
        <strong>Категория</strong> — <em>Профессиональные услуги</em>.
      </>,
      <><strong>Описание</strong> — можно пропустить.</>,
      <>
        Жми <strong>Далее</strong>{" "}
        <span className="text-gray-500">(Next)</span>.
      </>,
    ],
    mock: "profile",
  },
  {
    n: 4,
    title: "Введи номер → Отправить код",
    lines: [
      <><strong>Код страны</strong>: +62.</>,
      <>
        <strong>Номер</strong>: 10 цифр без <code>+62</code> и без ведущего нуля.
      </>,
      <><strong>Способ подтверждения</strong>: SMS.</>,
      <>
        Жми <strong>Отправить код</strong>{" "}
        <span className="text-gray-500">(Send code)</span>.
      </>,
    ],
    mock: "phone",
  },
  {
    n: 5,
    title: "Введи 6 цифр из SMS → Подтвердить",
    lines: [
      <>SMS придёт за ~30 секунд.</>,
      <>
        Жми <strong>Подтвердить</strong>{" "}
        <span className="text-gray-500">(Verify)</span>.
      </>,
      <>
        Номер появится в списке со статусом{" "}
        <strong className="text-brand">«Подключено»</strong>.
      </>,
    ],
    mock: "code",
  },
  {
    n: 6,
    title: "Скопируй 2 значения и отправь админу",
    lines: [
      <>Кликни на свой новый номер в списке.</>,
      <>
        <strong>Phone Number ID</strong> — длинная цифра ~16 знаков.
      </>,
      <>
        <strong>Display phone</strong> — номер в формате{" "}
        <code>+62 8123456789</code>.
      </>,
    ],
  },
]

export default function WhatsAppSetupPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-brand leading-tight">
              Активация WhatsApp
            </h1>
            <p className="text-gray-500 mt-2">
              6 шагов, ≈ 30 минут. Все данные нужны только в начале —
              потом WhatsApp работает сам.
            </p>
          </div>
          <a
            href={FB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            Открыть Facebook
            <ExternalLink size={16} />
          </a>
        </header>

        {/* Steps */}
        <ol className="space-y-6">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand text-white font-bold text-lg flex items-center justify-center">
                  {s.n}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">
                    {s.title}
                  </h2>
                  <ul className="space-y-2 text-gray-700 leading-relaxed">
                    {s.lines.map((line, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-brand mt-1.5 flex-shrink-0">
                          •
                        </span>
                        <span className="min-w-0">{line}</span>
                      </li>
                    ))}
                  </ul>
                  {s.mock && <Mockup variant={s.mock} stepNum={s.n} />}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {/* Hand-off template */}
        <section className="mt-10 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Copy size={20} className="text-brand" />
            Шаблон для отправки
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Скопируй блок ниже, подставь свои значения, отправь админу:
          </p>
          <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm font-mono text-gray-800 whitespace-pre-wrap leading-relaxed">
{`Подключила номер для [НАЗВАНИЕ СТУДИИ].

Phone Number ID: ____________________
Display phone:   +62 ___________`}
          </pre>
        </section>

        {/* Footer */}
        <footer className="mt-10 text-center text-sm text-gray-400">
          <Link href="/admin/settings" className="text-brand hover:underline">
            ← Назад в Settings
          </Link>
        </footer>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Light-theme mockups — drawn inline with Tailwind so they invert cleanly
// from the dark Meta UI source. Each mimics a real screen the admin will see.
// ----------------------------------------------------------------------------
function Mockup({ variant, stepNum }: { variant: string; stepNum: number }) {
  const wrap =
    "mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm"
  switch (variant) {
    case "phones":
      return (
        <div className={wrap}>
          <BrowserChrome url="business.facebook.com/wa/manage/phone-numbers" />
          <div className="grid grid-cols-[180px,1fr] min-h-[280px]">
            <aside className="border-r border-gray-100 bg-gray-50 p-3 text-xs space-y-2">
              <div className="font-bold text-gray-900">WhatsApp Manager</div>
              <div className="text-gray-500">Обзор</div>
              <div className="text-gray-500">Шаблоны сообщений</div>
              <div className="text-gray-500 font-semibold pt-2">
                Инструменты управления
              </div>
              <div className="text-gray-400 pl-2">Статистика</div>
              <div className="pl-2 px-2 py-1 rounded bg-emerald-50 text-brand font-semibold -mx-2">
                Номера телефонов
              </div>
            </aside>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-900">
                  Номера телефонов
                </div>
                <div className="relative">
                  <button className="bg-[#1877F2] text-white text-xs font-semibold px-3 py-1.5 rounded-md">
                    + Добавить номер телефона
                  </button>
                  <Callout n={stepNum} className="-left-7 -top-1" />
                </div>
              </div>
              <div className="border border-gray-100 rounded-lg overflow-hidden text-xs">
                <div className="grid grid-cols-[1.2fr,1fr,90px,80px] gap-2 bg-gray-50 px-3 py-2 text-gray-500 font-medium">
                  <div>Номер</div>
                  <div>Название</div>
                  <div>Статус</div>
                  <div>Качество</div>
                </div>
                <div className="grid grid-cols-[1.2fr,1fr,90px,80px] gap-2 px-3 py-3 border-t border-gray-100 items-center">
                  <div className="font-semibold text-gray-900">
                    +62 821-3130-468
                  </div>
                  <div className="text-gray-700">GravityStretchingCanggu</div>
                  <div>
                    <span className="bg-emerald-50 text-brand px-2 py-0.5 rounded text-[10px] font-semibold border border-emerald-200">
                      Подключено
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Высокое
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    case "profile":
      return (
        <div className={wrap}>
          <BrowserChrome url="business.facebook.com/wa/manage/phone-numbers" />
          <div className="p-6 bg-gray-50 min-h-[320px]">
            <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-lg mx-auto">
              <div className="text-base font-bold text-gray-900 mb-1">
                Создайте профиль WhatsApp Business
              </div>
              <div className="text-xs text-gray-500 mb-4">
                В профиле показывается инфо для пользователей WhatsApp.
              </div>
              <Field label="Отображаемое имя WhatsApp Business" value="Gravity Stretching Bali" callout={2} />
              <Field label="Категория" value="Профессиональные услуги ▾" callout={3} />
              <Field label="Описание компании · Необязательно" value="" placeholder="Расскажите о своей компании…" />
              <div className="flex justify-end gap-2 mt-4">
                <button className="text-xs text-gray-600 px-3 py-1.5 rounded border border-gray-200">
                  Назад
                </button>
                <div className="relative">
                  <button className="bg-[#1877F2] text-white text-xs font-semibold px-4 py-1.5 rounded">
                    Далее
                  </button>
                  <Callout n={4} className="-right-7 -top-1" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    case "phone":
      return (
        <div className={wrap}>
          <BrowserChrome url="business.facebook.com/wa/manage/phone-numbers" />
          <div className="p-6 bg-gray-50 min-h-[320px]">
            <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-lg mx-auto">
              <div className="text-base font-bold text-gray-900 mb-1">
                Добавьте номер телефона
              </div>
              <div className="text-xs text-gray-500 mb-4">
                Этот номер НЕ должен быть зарегистрирован в WhatsApp.
              </div>
              <label className="text-xs font-semibold text-gray-800">
                Номер телефона
              </label>
              <div className="flex gap-2 mt-1 mb-4 relative">
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                  🇮🇩 +62 ▾
                </div>
                <div className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900">
                  8 123 456 789
                </div>
                <Callout n={2} className="-right-7 top-2" />
              </div>
              <label className="text-xs font-semibold text-gray-800">
                Способ подтверждения
              </label>
              <div className="mt-2 mb-4 space-y-1.5 text-sm">
                <label className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border-[3px] border-[#1877F2]" />
                  Текстовое сообщение (SMS)
                </label>
                <label className="flex items-center gap-2 text-gray-500">
                  <span className="w-3 h-3 rounded-full border-2 border-gray-300" />
                  Телефонный звонок
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button className="text-xs text-gray-600 px-3 py-1.5 rounded border border-gray-200">
                  Назад
                </button>
                <div className="relative">
                  <button className="bg-[#1877F2] text-white text-xs font-semibold px-4 py-1.5 rounded">
                    Отправить код
                  </button>
                  <Callout n={4} className="-right-7 -top-1" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    case "code":
      return (
        <div className={wrap}>
          <BrowserChrome url="business.facebook.com/wa/manage/phone-numbers" />
          <div className="p-6 bg-gray-50 min-h-[260px]">
            <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-lg mx-auto">
              <div className="text-base font-bold text-gray-900 mb-1">
                Введите код подтверждения
              </div>
              <div className="text-xs text-gray-500 mb-4">
                6-значный код отправлен по SMS.
              </div>
              <div className="flex gap-1.5 mb-4 relative">
                {["7", "4", "8", "2", "9", "1"].map((d, i) => (
                  <div
                    key={i}
                    className={`w-10 h-12 border-2 ${
                      i === 0 ? "border-[#1877F2]" : "border-gray-200"
                    } rounded-lg flex items-center justify-center font-bold text-lg text-gray-900`}
                  >
                    {d}
                  </div>
                ))}
                <Callout n={1} className="-right-7 top-3" />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button className="text-xs text-gray-600 px-3 py-1.5 rounded border border-gray-200">
                  Назад
                </button>
                <div className="relative">
                  <button className="bg-[#1877F2] text-white text-xs font-semibold px-4 py-1.5 rounded">
                    Подтвердить
                  </button>
                  <Callout n={2} className="-right-7 -top-1" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    default:
      return null
  }
}

function BrowserChrome({ url }: { url: string }) {
  return (
    <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
      <span className="w-3 h-3 rounded-full bg-red-400" />
      <span className="w-3 h-3 rounded-full bg-yellow-400" />
      <span className="w-3 h-3 rounded-full bg-emerald-400" />
      <div className="ml-3 flex-1 bg-white border border-gray-200 rounded px-3 py-1 text-xs text-gray-500 font-mono">
        {url}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  placeholder,
  callout,
}: {
  label: string
  value: string
  placeholder?: string
  callout?: number
}) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold text-gray-800 block mb-1">
        {label}
      </label>
      <div className="relative">
        <div
          className={`border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white ${
            value ? "text-gray-900" : "text-gray-400 italic"
          }`}
        >
          {value || placeholder}
        </div>
        {callout && <Callout n={callout} className="-right-7 top-1" />}
      </div>
    </div>
  )
}

function Callout({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span
      className={`absolute w-7 h-7 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center border-2 border-white shadow ${className}`}
    >
      {n}
    </span>
  )
}
