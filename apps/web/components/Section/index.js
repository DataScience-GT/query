//imports
import styles from "./Section.module.scss";

/**
 * a section that has a max-width to fix wide-monitors
 * @param {*} params
 * @returns
 */
const Section = (params) => {
    return (
        <div
            className={`${styles.Section} ${
                params.makefull ? styles.FullSection : ""
            }`}
            {...params}
        >
            <div className={styles.SectionWrapper}>{params.children}</div>
        </div>
    );
};
export default Section;
