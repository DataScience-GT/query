"use client";

import { useState } from "react";
import { Scanner, centerText } from "@yudiel/react-qr-scanner";

export default function AdminScanPage() {
  const [pause, setPause] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<{
    success: boolean;
    message: string;
    userName?: string;
    school?: string;
    major?: string;
  } | null>(null);

  const handleScan = async (data: string) => {
    if (!data || pause) return;
    
    setPause(true);
    
    try {
      const res = await fetch(`/api/verify?uuid=${encodeURIComponent(data)}`);
      const result = await res.json();

      setModalData(result);
      setShowModal(true);
    } catch (err) {
      console.error("Error verifying QR:", err);
      setModalData({
        success: false,
        message: "Error verifying QR code. Please try again.",
      });
      setShowModal(true);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalData(null);
    setTimeout(() => setPause(false), 500);
  };

  return (
    <div className="p-8 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-center">Admin QR Scanner</h1>

      <div className="w-full max-w-md rounded-xl overflow-hidden shadow-lg">
        <Scanner
          formats={["qr_code"]}
          onScan={(codes) => codes.length > 0 && handleScan(codes[0].rawValue)}
          components={{ tracker: centerText }}
          scanDelay={1000}
          paused={pause}
          allowMultiple
          classNames={{
            container: "rounded-xl",
            video: "rounded-xl"
          }}
        />
      </div>

      {/* Modal */}
      {showModal && modalData && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className={`bg-black border-2 rounded-xl p-6 max-w-md w-full ${
            modalData.success ? 'border-green-500' : 'border-red-500'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${
                modalData.success ? 'text-green-400' : 'text-red-400'
              }`}>
                {modalData.success ? '✅ Check-in Successful' : '❌ Check-in Failed'}
              </h2>
              <button
                onClick={closeModal}
                className="text-yellow-400 hover:text-yellow-200 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-2">
              {modalData.success ? (
                <>
                  <p className="text-yellow-400">
                    <span className="font-semibold">Name:</span> {modalData.userName}
                  </p>
                  {modalData.school && (
                    <p className="text-yellow-400">
                      <span className="font-semibold">School:</span> {modalData.school}
                    </p>
                  )}
                  {modalData.major && (
                    <p className="text-yellow-400">
                      <span className="font-semibold">Major:</span> {modalData.major}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-red-400">{modalData.message}</p>
              )}
            </div>

            <button
              onClick={closeModal}
              className={`mt-6 w-full py-2 rounded-lg font-semibold ${
                modalData.success
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
