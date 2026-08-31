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
  const cls = `inline-block shrink-0 overflow-hidden rounded-full bg-line text-center font-medium text-muted ${className ?? ''}`;
  if (failed) {
    return (
      <span className={cls} style={{ width: size, height: size, lineHeight: `${size}px`, fontSize: size * 0.45 }}>
        {name?.[0] ?? '?'}
      </span>
    );
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