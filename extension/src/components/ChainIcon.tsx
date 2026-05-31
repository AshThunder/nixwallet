interface ChainIconProps {
  networkId: string;
  className?: string;
}

export default function ChainIcon({ networkId, className = 'w-4 h-4 shrink-0' }: ChainIconProps) {
  const nid = networkId.toLowerCase();

  if (nid.includes('base')) {
    // Official Base Logo style
    return (
      <svg
        viewBox="0 0 200 200"
        className={className}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="100" fill="#0052FF" />
        <rect y="84" width="132" height="32" fill="white" />
      </svg>
    );
  }

  if (nid.includes('arb') || nid.includes('arbitrum')) {
    // Official Arbitrum Logo
    return (
      <svg
        viewBox="0 0 2500 2500"
        className={className}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path fill="#213147" d="M226,760v980c0,63,33,120,88,152l849,490c54,31,121,31,175,0l849-490c54-31,88-89,88-152V760c0-63-33-120-88-152l-849-490c-54-31-121-31-175,0L314,608c-54,31-87,89-87,152H226z"></path>
        <path fill="#12AAFF" d="M1435,1440l-121,332c-3,9-3,19,0,29l208,571l241-139l-289-793C1467,1422,1442,1422,1435,1440z"></path>
        <path fill="#12AAFF" d="M1678,882c-7-18-32-18-39,0l-121,332c-3,9-3,19,0,29l341,935l241-139L1678,883V882z"></path>
        <path fill="#9DCCED" d="M1250,155c6,0,12,2,17,5l918,530c11,6,17,18,17,30v1060c0,12-7,24-17,30l-918,530c-5,3-11,5-17,5s-12-2-17-5l-918-530c-11-6-17-18-17-30V719c0-12,7-24,17-30l918-530c5-3,11-5,17-5l0,0V155z M1250,0c-33,0-65,8-95,25L237,555c-59,34-95,96-95,164v1060c0,68,36,130,95,164l918,530c29,17,62,25,95,25s65-8,95-25l918-530c59-34,95-96,95-164V719c0-68-36-130-95-164L1344,25c-29-17-62-25-95-25l0,0H1250z"></path>
        <path fill="#FFFFFF" d="M1172,644H939c-17,0-33,11-39,27L401,2039l241,139l550-1507c5-14-5-28-19-28L1172,644z"></path>
        <path fill="#FFFFFF" d="M1580,644h-233c-17,0-33,11-39,27L738,2233l241,139l620-1701c5-14-5-28-19-28V644z"></path>
      </svg>
    );
  }

  // Ethereum Sepolia Logo (3D purple-gray metallic diamond)
  return (
    <svg
      viewBox="0 0 784 1277"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M392 0L383.5 28.5V870.5L392 879L784 648L392 0Z" fill="#5D5D8A" />
      <path d="M392 0L0 648L392 879V470V0Z" fill="#8A8ABF" />
      <path d="M392 956L387 961V1271.5L392 1277L784 725.5L392 956Z" fill="#3B3B5E" />
      <path d="M392 1277V956L0 725.5L392 1277Z" fill="#5D5D8A" />
      <path d="M392 879L784 648L392 470V879Z" fill="#2C2C47" />
      <path d="M0 648L392 879V470L0 648Z" fill="#4B4B75" />
    </svg>
  );
}
