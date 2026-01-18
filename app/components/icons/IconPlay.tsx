import { IconBase, type IconProps } from "./IconBase";

export function IconPlay(props: IconProps) {
  return (
    <IconBase {...props}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M9.99984 18.3337C14.6022 18.3337 18.3332 14.6027 18.3332 10.0003C18.3332 5.39795 14.6022 1.66699 9.99984 1.66699C5.39746 1.66699 1.6665 5.39795 1.6665 10.0003C1.6665 14.6027 5.39746 18.3337 9.99984 18.3337Z"
          stroke="#4A4949"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.3335 6.66699L13.3335 10.0003L8.3335 13.3337V6.66699Z"
          stroke="#4A4949"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
      </svg>
    </IconBase>
  );
}
