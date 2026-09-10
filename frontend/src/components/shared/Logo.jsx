import Image from 'next/image';

export default function Logo({ size = 48, showText = true, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <Image
          src="/logo.jpeg"
          alt="Manikstu Agro"
          width={size}
          height={size}
          className="object-contain rounded-full"
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span
            className="font-extrabold tracking-tight"
            style={{ color: '#2E7D32', fontSize: size * 0.42 }}
          >
            Manikstu
          </span>
          <span
            className="font-semibold tracking-widest uppercase"
            style={{ color: '#66BB6A', fontSize: size * 0.22 }}
          >
            Agro
          </span>
        </div>
      )}
    </div>
  );
}
