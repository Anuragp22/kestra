export function isOffsetInPebbleBlock(text: string, offset: number): boolean {
    if (offset < 2) {
        return false
    }
    const searchUpTo = offset - 1
    return text.lastIndexOf("{{", searchUpTo) > text.lastIndexOf("}}", searchUpTo)
}
