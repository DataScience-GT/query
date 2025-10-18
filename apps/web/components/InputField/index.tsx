"use client";

import React from "react";

interface InputFieldProps {
  width?: string | number;
  placeholder?: string;
  name?: string;
  helper?: boolean;
  validIndication?: boolean;
  type?: "text" | "email" | "password" | "submit" | "textarea";
  required?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  pattern?: string;
  originalValue?: string;
  onClick?: () => void;
  helperText?: string;
}

const InputField: React.FC<InputFieldProps> = ({
  width = "300px",
  placeholder = "",
  name,
  helper,
  validIndication,
  type = "text",
  required,
  onChange,
  pattern,
  originalValue,
  onClick,
  helperText,
}) => {
  const id = name || placeholder.replaceAll(" ", "");

  if (type === "submit") {
    return (
      <div
        data-testid="InputField"
        style={{ width }}
        className="my-4 h-15"
      >
        <input
          id={id}
          type="submit"
          onClick={onClick}
          name={id}
          autoComplete={id}
          value={placeholder || "Submit"}
          className="w-full h-full px-4 py-2 border-2 border-white rounded-lg text-white bg-transparent text-lg font-medium cursor-pointer transition-all duration-300 hover:bg-white hover:text-black active:scale-95"
        />
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div data-testid="InputField" style={{ width }} className="relative my-3">
        {helperText && <p className="text-sm text-green-500 mb-1">{helperText}</p>}
        <textarea
          id={id}
          placeholder=" "
          onChange={onChange}
          value={originalValue}
          className="w-full h-48 px-4 py-3 rounded-lg border-2 border-white bg-transparent text-white placeholder-transparent focus:outline-none focus:border-teal-400 transition-all"
        />
        <label
          htmlFor={id}
          className="absolute top-3 left-4 text-white text-lg pointer-events-none transition-all duration-300"
        >
          {placeholder}
        </label>
      </div>
    );
  }

  return (
    <div data-testid="InputField" style={{ width }} className="relative my-3">
      {helperText && <p className="text-sm text-green-500 mb-1">{helperText}</p>}
      <input
        id={id}
        name={id}
        autoComplete={id}
        type={type}
        placeholder=" "
        required={required}
        onChange={onChange}
        pattern={pattern}
        value={originalValue}
        className={`w-full px-4 py-2 rounded-lg border-2 bg-transparent placeholder-transparent text-white focus:outline-none transition-all duration-300 ${
          validIndication ? "border-green-500" : "border-white"
        }`}
      />
      <label
        htmlFor={id}
        className="absolute top-2 left-4 text-white text-lg pointer-events-none transition-all duration-300"
      >
        {placeholder}
      </label>
    </div>
  );
};

export default InputField;
