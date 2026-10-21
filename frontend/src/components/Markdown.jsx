import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components = {
  p: p => <p className="my-2 first:mt-0 last:mb-0" {...p} />,
  ul: p => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-mute" {...p} />,
  ol: p => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-mute" {...p} />,
  strong: p => <strong className="font-semibold text-ink" {...p} />,
  a: p => <a className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
  code: p => <code className="rounded bg-soft px-1 py-0.5 text-[0.85em]" {...p} />,
  h1: p => <h3 className="mt-3 mb-1 text-base font-semibold" {...p} />,
  h2: p => <h3 className="mt-3 mb-1 text-base font-semibold" {...p} />,
  h3: p => <h4 className="mt-3 mb-1 text-sm font-semibold" {...p} />,
  table: p => <div className="scroll my-2 overflow-x-auto"><table className="w-full border-collapse text-xs" {...p} /></div>,
  th: p => <th className="border-b border-line px-2 py-1.5 text-left font-semibold text-mute" {...p} />,
  td: p => <td className="border-b border-line px-2 py-1.5" {...p} />,
}

export default function Markdown({ children }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>
}
