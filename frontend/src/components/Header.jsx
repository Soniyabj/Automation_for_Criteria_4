// src/components/Header.jsx
import React from "react";
import mitLogo from "../assets/mit.png";
import iseLogo from "../assets/ise.jpg";

/**
 * Header displayed on all pages.
 * Left: MIT Logo (bigger)
 * Center: College Name + Details
 * Right: ISE Logo (bigger)
 */
export default function Header({ small = false }) {
  return (
    <header className="w-full bg-white border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center ${small ? "py-2" : "py-4"}`}>
          
          {/* LEFT LOGO — Increased size */}
          <div className="flex-shrink-0 w-28 flex items-center justify-start">
            <img
              src={mitLogo}
              alt="MIT Mysore"
              className="h-20.5 w-auto object-contain"
            />
          </div>

          {/* CENTER TEXT */}
          <div className="flex-1 text-center px-4">
            <div className={`${small ? "text-lg" : "text-xl"} font-bold text-blue-700`}>
              MAHARAJA INSTITUTE OF TECHNOLOGY MYSORE, MANDYA
            </div>

            <div className={`${small ? "text-xs" : "text-sm"} text-gray-700 mt-1`}>
              <em>
                An Autonomous Institute affiliated to Visvesvaraya Technological University, Belagavi
              </em>
            </div>

            <div className={`${small ? "text-sm" : "text-base"} text-red-700 font-semibold mt-1`}>
              DEPARTMENT OF INFORMATION SCIENCE AND ENGINEERING
            </div>
          </div>

          {/* RIGHT LOGO — Increased size */}
          <div className="flex-shrink-0 w-28 flex items-center justify-end">
            <img
              src={iseLogo}
              alt="ISE Logo"
              className="h-20.5 w-auto object-contain"
            />
          </div>

        </div>
      </div>
    </header>
  );
}
