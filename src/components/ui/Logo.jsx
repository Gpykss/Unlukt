// src/components/ui/Logo.jsx - REBRANDED TO UNLUKT

export default function Logo({ theme = 'light', size = 'md', className = '' }) {
  const sizes = {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-12',
    xl: 'h-16'
  };

  // ✅ Use the new unlukt logo
  const logoSrc = '/src/assets/images/logo.png'; // Your lock logo
  const nameSrc = '/src/assets/images/unlukt-logo.png'; // Your text logo

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {/* Lock Logo */}
      <img 
        src={logoSrc} 
        alt="unlukt" 
        className={`${sizes[size]} w-auto object-contain`}
      />
      {/* Text Logo */}
      <img 
        src={nameSrc} 
        alt="unlukt" 
        className={`${sizes[size]} w-auto object-contain`}
      />
    </div>
  );
}
