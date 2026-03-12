// src/components/Settings/DataLiteToggle.jsx

import { Wifi, WifiOff, Info } from 'lucide-react';
import { useDataLite } from '../../contexts/DataLiteContext';

export default function DataLiteToggle() {
  const { dataLite, setDataLite } = useDataLite();

  return (
    <div className={`rounded-2xl border-2 transition ${
      dataLite ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-xl ${dataLite ? 'bg-blue-100' : 'bg-gray-100'}`}>
            {dataLite
              ? <WifiOff className="w-5 h-5 text-blue-600" />
              : <Wifi className="w-5 h-5 text-gray-500" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-gray-900 text-sm">Data Saver</p>
              {dataLite && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">ON</span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {dataLite
                ? 'Videos won\'t autoplay · Lower quality images'
                : 'Full quality media · Videos autoplay'}
            </p>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          onClick={() => setDataLite(!dataLite)}
          className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
            dataLite ? 'bg-blue-500' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={dataLite}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
            dataLite ? 'translate-x-6' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {dataLite && (
        <div className="px-5 pb-4 flex items-start gap-2 border-t border-blue-200">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-2" />
          <p className="text-xs text-blue-700 mt-2">
            Data Saver is on. Videos will not autoplay in the feed and images load at lower quality to save your mobile data.
          </p>
        </div>
      )}
    </div>
  );
}