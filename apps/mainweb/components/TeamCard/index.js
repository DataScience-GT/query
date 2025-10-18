//imports
import styles from "./TeamCard.module.scss";

const TeamCard = (params) => {
    //pass in img, name, title, and in params.children the content
    return (
        <div className={styles.TeamCard}>
            <div
                className={`${styles.Image} ${
                    params.wide ? styles.WideImage : ""
                } ${params.tall ? styles.TallImage : ""}
                ${params.zoom && params.top ? styles.ZoomImageTOP : ""}
                ${params.zoom && params.bottom ? styles.ZoomImageBOTTOM : ""}
                ${params.top ? styles.Top : ""}
                ${
                    params.zoom && !(params.top && params.bottom)
                        ? styles.ZoomImage
                        : ""
                }`}
            >
                <img
                    alt={`${params.name}`}
                    src={params.img}
                    style={{ top: params.top }}
                />
            </div>
            <h2 className={styles.Title}>{params.title}</h2>
            <h1 className={styles.Major}>{params.name}</h1>
            <p className={styles.Content}>{params.children}</p>
        </div>
    );
};
export default TeamCard;
