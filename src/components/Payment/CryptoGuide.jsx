// src/components/Payment/CryptoGuide.jsx
// "How to buy crypto" — a short guide for fans who have never paid with crypto before.
// Shown at checkout (Wallet → Add Funds, and the Pay with Crypto step).

import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

// Apps suggested in step 1. Unlukt is global, so these are big international names rather than
// one country's apps. None of them works in every country — the guide says so. Edit freely.
const EXCHANGE_EXAMPLES = ['Bybit', 'Binance', 'OKX', 'Coinbase', 'Kraken'];
const WALLET_EXAMPLES = ['Trust Wallet', 'MetaMask'];

const STEPS = [
  {
    title: 'Get a crypto app',
    body: 'Install a crypto exchange or wallet app that is available in your country and lets you buy with your bank card, bank transfer or P2P. Create an account and finish its verification.',
  },
  {
    title: 'Buy USDT',
    body: 'USDT is a "stablecoin": 1 USDT is about 1 US dollar, so the price does not jump around. Buy a little more than your total here, because your app charges a small fee to send it.',
  },
  {
    title: 'Start the payment here',
    body: 'Tap Continue, then Initialize Payment. On the payment page choose USDT and a network that your app also offers (TRC20 / Tron is a common low-fee one). It then shows a wallet address and the exact amount to send.',
  },
  {
    title: 'Send it from your app',
    body: 'In your crypto app tap Withdraw or Send, paste the address, pick the SAME network, and enter the exact amount shown. If your app takes its fee out of what you send, add the fee on top.',
  },
  {
    title: 'Wait a few minutes',
    body: 'Once the network confirms the transfer, your Unlukt wallet is topped up automatically. You can close the payment page and check your wallet balance.',
  },
];

export default function CryptoGuide({ defaultOpen = false, showNairaTip = true, className = '' }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-xl border border-indigo-200 bg-indigo-50 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
          <HelpCircle className="w-4 h-4 flex-shrink-0" />
          New to crypto? How to buy and pay
        </span>
        <ChevronDown className={`w-4 h-4 text-indigo-700 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3">
          <ol className="space-y-2.5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <p className="text-xs font-bold text-indigo-950">{step.title}</p>
                  <p className="text-xs text-indigo-900 leading-relaxed">{step.body}</p>
                  {i === 0 && (
                    <p className="text-xs text-indigo-900 mt-1">
                      Used worldwide: <b>{EXCHANGE_EXAMPLES.join(', ')}</b>. Or a wallet app such as{' '}
                      <b>{WALLET_EXAMPLES.join(' or ')}</b>, where you can buy with a card. Not every app is
                      available in every country, so pick one that works where you live.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
            <p className="text-xs font-bold text-amber-900 mb-1">Before you send</p>
            <ul className="text-xs text-amber-900 space-y-0.5 list-disc list-inside">
              <li>Use the same coin and network on both sides. A different network can lose the money.</li>
              <li>Copy and paste the address. Never type it by hand.</li>
              <li>Send soon after starting. If the payment page expires, start a new one.</li>
            </ul>
          </div>

          <p className="text-[11px] text-indigo-900 mt-2.5">
            Already hold another coin (Bitcoin, Ethereum, Litecoin…)? You can pay with that instead. Just choose
            it on the payment page.
          </p>

          {showNairaTip && (
            <p className="text-[11px] text-indigo-900 mt-1.5">
              In Nigeria and prefer not to use crypto? Choose <b>Pay with Bank Transfer (NGN)</b> in Add Funds instead.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
