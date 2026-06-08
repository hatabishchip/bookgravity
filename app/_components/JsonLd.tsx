// Server component that injects schema.org JSON-LD structured data. Google reads
// this to build rich results / knowledge entries. Pass one object or an array.
export default function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // Server-rendered JSON-LD (no user input) — safe to inline.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
