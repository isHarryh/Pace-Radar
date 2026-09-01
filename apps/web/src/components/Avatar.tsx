import { useState } from 'react';
import { avatarUrl } from '../api';

export function Avatar({
  accountId,
  name,
  size = 32,
  className,
}: {
  accountId: number;
  name?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const sizeClass = size === 28 ? 'size-7 text-xs leading-7' : size === 36 ? 'size-9 text-base leading-9' : 'size-8 text-sm leading-8';
  const cls = `avatar ${sizeClass} ${className ?? ''}`;
  if (failed) {
    return <span className={cls}>{name?.[0] ?? '?'}</span>;
  }
  return (
    <img
      src={avatarUrl(accountId)}
      width={size}
      height={size}
      alt=""
      className={`${cls} object-cover`}
      onError={() => setFailed(true)}
    />
  );
}
