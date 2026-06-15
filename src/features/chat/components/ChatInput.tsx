interface Props {
  value:      string
  isLoading:  boolean
  onChange:   (text: string) => void
  onSend:     () => void
}

// Borderless premium input — the glass dock around it (MainOS) provides the frame.
export function ChatInput({ value, isLoading, onChange, onSend }: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && value.trim() && !isLoading) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={isLoading}
      placeholder={isLoading ? 'Piku is thinking…' : 'Ask Piku anything…'}
      autoFocus
      className="
        w-full bg-transparent px-1 py-2 text-[15px] text-white/90 outline-none
        placeholder:text-white/35
        disabled:opacity-60 disabled:cursor-not-allowed
      "
    />
  )
}
