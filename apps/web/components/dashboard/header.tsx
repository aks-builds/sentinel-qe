import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SignOutButton } from './sign-out-button'

type HeaderProps = {
  user: { name?: string | null; email?: string | null }
}

function getInitials(user: HeaderProps['user']): string {
  if (user.name) {
    return user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return user.email?.[0]?.toUpperCase() ?? '?'
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-end gap-3 border-b px-6">
      <span className="text-sm text-muted-foreground">{user.email}</span>
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
      </Avatar>
      <SignOutButton />
    </header>
  )
}
